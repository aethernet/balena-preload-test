import crypto from 'crypto';
import tar from 'tar-stream';
import gunzip from 'gunzip-maybe';
import { digestStream } from './digestStream';
import { getUrls, getBlob } from './registry';
import {
	ManifestConfig,
	ManifestInfosFromRegistry,
	Rootfs,
} from './interface-manifest';
import { inspect } from 'util';
import { Pack, Headers } from 'tar-stream';

interface LayerMeta {
	size: number;
	diff_id: string | null;
}

interface Layer extends ManifestConfig, LayerMeta {
	diff_id: string;
	chain_id: string;
	diffId: string | number | null;
	chainId: string;
	isDuplicate: boolean;
	token: string;
	parent: string | null;
	link:
		| 'link'
		| 'symlink'
		| 'directory'
		| 'file'
		| 'character-device'
		| 'block-device'
		| 'fifo'
		| 'contiguous-file'
		| 'pax-header'
		| 'pax-global-header'
		| 'gnu-long-link-path'
		| 'gnu-long-path'
		| null
		| undefined;
	lower?: string | null;
	cacheId?: string;
}

interface LayerRaw {
	size: number;
	digest: string;
}

/**
 * Precompute _Layers_ array
 * A flat array of objects representing all layer from all images for all the apps/releases to preload
 *
 * Object contains :
 * - `token` used to auth to the registry
 * - `diff_id` from the image config manifest
 * - `chain_id` computed for the layer
 * - `isDuplicate` boolean, true if an indentical layer has been found
 * - `parent` chain id of the parent layer (if not first layer in the chain)
 * - `link` 13 char all caps random string, unless it's a duplicated layer, in that case use the same link as the first encounter
 * - `lower` chain of all links up to the topmost layer in the chain
 *
 * Note : here we precomputes almost all values we'll need later to create the files/folders for the layer.
 * `cache-id` is not precompute at this stage for performance reasons.
 *
 * `chache-id` will be randomly assigned to each layer when downloading.
 * While downlaoding we'll compute the `diff_id` (sha256 hash of gunziped data) of the layer we're downloading
 * and find the matching pre-computed meta-data in this `layers` array.
 *
 * @param {[Object]} manifests - array of image config manifests
 */

async function getLayers(manifests: ManifestInfosFromRegistry[]) {
	console.log(`== getting Layers @getLayers == ${manifests}`);
	return manifests
		.map(({ diffIds, token }) => {
			// loops on images and compute / generate values all layers
			// use same `cache` and `link` in case of duplicated layers (layers with same chain_id in two images)
			// note : we'll generate `cacheId` later when processing the layer and link back then
			const computedLayers: Layer[] = [];
			for (const key in diffIds) {
				// TODO just use Object Keys in loop?
				if (Object.prototype.hasOwnProperty.call(diffIds, key)) {
					const diffId = diffIds[parseInt(key, 10)];
					const chainId =
						parseInt(key, 10) === 0
							? diffId.split(':')[1]
							: computeChainId({
									previousChainId:
										computedLayers[parseInt(key, 10) - 1].chainId,
									diffId,
							  });
					const duplicateOf = computedLayers.find(
						(layer) => layer.chain_id === chainId,
					);
					computedLayers.push({
						token,
						diffId,
						chainId,
						parent:
							parseInt(key, 10) > 0
								? computedLayers[parseInt(key, 10) - 1].chain_id
								: null,
						isDuplicate: Boolean(duplicateOf),
						link: duplicateOf
							? duplicateOf.link
							: crypto.randomBytes(13).toString('hex').toUpperCase(),
					} as Layer);
				}
			}
			return computedLayers;
		})
		.map((layers: Layer[]) => {
			// 7. compute the lower link chain
			// `lower` chain is a string composed of the path to the `link` of all lower layers in the chain
			// i.e. : `l/*sublayer1link*:l/*sublayer2link:l/*sublayer3link`
			// lowest layer doesn't have (empty lower)
			const chain = layers.map((layer) => `l/${layer.link}`);
			return layers.map((layer, key) => ({
				...layer,
				lower: key > 0 ? chain.slice(0, key).join(':') : null,
			}));
		})
		.flat();
}

/**
 * Given a list of distribution manifests, return a flatten list of deduped layer blob digests ready to be downloaded
 * Note: these digests are not `diff_id` as these are from *compressed* layers (tar.gz) while diff_id are from *uncompressed* (tar)
 * @param {[Object]} manifests - array of distribution manifests with auth
 * @return {[Object]} layerUrls - array of layers blob digests with athentication token
 */
const getLayerDistributionDigests = (
	manifests: ManifestInfosFromRegistry[],
) => {
	return manifests
		.map(({ manifest, imageName, token }) =>
			manifest.layers.map((layer: LayerRaw) => ({
				imageName,
				token,
				compressedSize: layer.size,
				layer: layer.digest.split(':')[1],
			})),
		)
		.flat()
		.filter((layer, index, layers) => layers.indexOf(layer) === index); // dedupe to prevent downloading twice layers shared across images
};

/**
 * Generate random 32 char lowercase `chain_id`
 *
 * we generate the random chain_id for the layer here (instead of doig so when pre-computing layer infos)
 * like this we can stream the layer prior to knowing it's `diff_id`
 * getting the diff_id require to hash (sha256) layer's `tarball`, which means we need to get the whole layer first
 *
 * As we don't want to keep the whole layer in memory, we'll hash while streaming (on the wire)
 * and link the `cache` with all layers having matching `diff_id` (there might be duplicate layers with same `diff_id` but different `chain_id`)
 */
const getRandomDiffId = (): string => crypto.randomBytes(32).toString('hex');

/**
 * Prepare files from layer metadata
 */
const generateFilesForLayer = ({
	chain_id,
	diff_id,
	parent,
	lower,
	link,
	size,
	cacheId,
}: Layer) => {
	// compute useful paths
	const dockerOverlay2CacheId = `docker/overlay2/${cacheId}`;
	const dockerOverlay2l = 'docker/overlay2/l';
	const dockerImageOverlay2LayerdbSha256 =
		'docker/image/overlay2/layerdb/sha256';
	const dockerImageOverlay2LayerdbSha256ChainId = `${dockerImageOverlay2LayerdbSha256}/${chain_id}`;

	const files = [
		// `link` symlink from `l/_link_` to `../_cacheId_/diff`
		{
			header: {
				name: `${dockerOverlay2l}/${link}`,
				type: 'symlink',
				linkname: `../${cacheId}/diff`,
			},
		},
		// emtpy `commited` file
		{
			header: { name: `${dockerOverlay2CacheId}/commited`, mode: 600 },
			content: '',
		},
		// emtpy `work` directory
		{
			header: {
				name: `${dockerOverlay2CacheId}/work`,
				mode: 777,
				type: 'directory',
			},
		},
		// `link` file
		{
			header: { name: `${dockerOverlay2CacheId}/link`, mode: 644 },
			content: link,
		},
		// `diff` file
		{
			header: {
				name: `${dockerImageOverlay2LayerdbSha256ChainId}/diff`,
				mode: 755,
			},
			content: diff_id,
		},
		// `cacheId` file
		{
			header: {
				name: `${dockerImageOverlay2LayerdbSha256ChainId}/cache-id`,
				mode: 755,
			},
			content: cacheId,
		},
		// `size` file
		{
			header: {
				name: `${dockerImageOverlay2LayerdbSha256ChainId}/size`,
				mode: 755,
			},
			content: String(size),
		},
	];

	// `parent` file; first layer doens't have parent
	if (parent) {
		files.push({
			header: {
				name: `${dockerImageOverlay2LayerdbSha256ChainId}/parent`,
				mode: 755,
			},
			content: parent,
		});
	}

	// `lower` chain; last layer doesn't have lower
	if (lower) {
		files.push({
			header: { name: `${dockerOverlay2CacheId}/lower`, mode: 644 },
			content: lower,
		});
	}

	return files;
};

/** DownloadProcessLayers
 * // 8. download and process layers
 *
 * This is the meaty part of the process.
 * For each layer it will (on stream) :
 *  - stream from registry
 *  - gunzip
 *  - digest (on the fly)
 *  - untar
 *  - rename files to match the destination directory
 *  - tar (`pack`)
 *  - stream to output
 *
 * Then create all metadata files, `tar` and stream them to output using `packFile`
 */

interface ProcessLayerIn {
	manifests: ManifestInfosFromRegistry[];
	layers: Layer[];
	packStream: Pack;
	injectPath: string;
}

const downloadProcessLayers = async ({
	manifests,
	layers,
	packStream,
	injectPath,
}: ProcessLayerIn) => {
	console.log(`== Processing Layers @downloadProcessLayers ==`);

	const processingLayers = getLayerDistributionDigests(manifests);
	const injectableFiles = [];

	for (const key in processingLayers) {
		if (Object.prototype.hasOwnProperty.call(processingLayers, key)) {
			const { layer, imageName, compressedSize, token } = processingLayers[key];
			console.log(
				`=> ${parseInt(key, 10) + 1} / ${processingLayers.length} : ${layer}`,
			);

			try {
				const cacheId = getRandomDiffId();

				// get the url
				const { imageUrl } = getUrls(imageName);

				// get the stream
				const layerStream: NodeJS.ReadableStream = await getBlob(
					imageUrl,
					token,
					{ digest: `sha256:${layer}`, size: compressedSize },
				);

				// process the stream and get back `size` (uncompressed) and `diff_id` (digest)
				const { size, diff_id }: LayerMeta = await layerStreamProcessing({
					layerStream,
					packStream,
					cacheId,
					injectPath,
				});

				// find all layers related to this archive
				const relatedLayers = layers.filter(
					(layerRelated: Layer) => layerRelated.diff_id === diff_id,
				);

				// create the metadata and link files for all related layers
				for (const layerRelated of relatedLayers) {
					injectableFiles.push(
						generateFilesForLayer({ ...layerRelated, size, cacheId }),
					);
				}
			} catch (error) {
				console.log('downloadProcessLayers CATCH', error);
			}
		}
	}
	return injectableFiles.flat();
};

interface ComputeChainInput {
	previousChainId: string;
	diffId: string;
}
/** Compute Chain Id
 *
 * formula is : sha256 of a string composed of the chainid of the parent layer, a space, and the diffid of the layer
 * i.e. sha256("sha256:e265835b28ac16782ef429b44427c7a72cdefc642794515d78a390a72a2eab42 sha256:573a4eb582cc8a741363bc2f323baf020649960822435922c50d956e1b22a787")
 *
 */
const computeChainId = ({
	previousChainId,
	diffId,
}: ComputeChainInput): string =>
	crypto
		.createHash('sha256')
		.update(`sha256:${previousChainId} ${diffId}`)
		.digest('hex');

interface LayerStreamInput {
	layerStream: NodeJS.ReadableStream;
	packStream: Pack;
	cacheId: string;
	injectPath: string;
}

/**
 * Promise : Layer Stream Processing
 */
async function layerStreamProcessing({
	layerStream,
	packStream,
	cacheId,
	injectPath,
}: LayerStreamInput): Promise<LayerMeta> {
	const extract = tar.extract();

	// Promisify the event based control flow
	return new Promise((resolve) => {
		// 0. Setup the digester
		const layerMeta: LayerMeta = {
			diff_id: null,
			size: -1,
		};

		const digesterCb = (resultDigest: string, length: number): void => {
			// logger.log(`=> digesterCb resultDigest: ${resultDigest}, ${length}`, packStream, cacheId)
			layerMeta.diff_id = `sha256:${resultDigest}`;
			layerMeta.size = length;
		};

		const digester = digestStream(digesterCb);

		// 4. tar extract happens here
		extract.on(
			'entry',
			(
				header: Headers & { pax: any },
				stream: NodeJS.ReadableStream,
				next: () => void,
			) => {
				if (header.pax) {
					/**
					 * DELETE header.pax here, if it exists, as it is causing problems with the symlink handling.
					 * header.pax overrides over the from/to name path for the symlinks so ends up at root level
					 */
					console.log(
						`=> @layerStreamProcessing header ${inspect(
							header,
							true,
							2,
							true,
						)}`,
					);
					delete header.pax;
				}

				// change the name of the file to place it at the right position in tar archive folder tree
				const headerNewName = {
					...header,
					name: `${injectPath}/docker/overlay2/${cacheId}/diff/${header.name}`,
				};

				// 5. change header name to give file its destination folder in the output tarball
				const filePack = packStream.entry(headerNewName);

				stream.pipe(filePack);

				// TODO: better error handling

				// we cannot just wait on the readable stream to end (stream) but for writable one to finish before processing the next file
				filePack.on('finish', () => {
					next();
				});
			},
		);

		// 7. when this layer finish extraction, we get the digest (diff_id) and size from the digester
		// then resolve the promise to allow moving on to the next layer
		extract.on('finish', () => {
			resolve(layerMeta);
		});

		layerStream
			.pipe(gunzip()) // 1. uncompress if necessary, will pass thru if it's not gziped
			.pipe(digester) // 2. compute hash and forward (this is a continuous process we'll get the result at the end)
			.pipe(extract); // 3. extract from the layer tar archive (generate `entry` events cf 4.)
	});
}

export { getLayers, downloadProcessLayers };
