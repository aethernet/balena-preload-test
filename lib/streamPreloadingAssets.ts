import { getManifests } from './registry';
import {
	buildRepositories,
	repositoriesJsonInjectionPath,
} from './repositoriesjson';
import { streamBaseImage } from './baseImage';
import { getAppsJson, getImageIds } from './appsJson';
import { getLayers, downloadProcessLayers } from './layers';
import { promisePacker, getTarballStream } from './packer';
import { getImagesConfigurationFiles } from './images';
import { getSupervisorImageNameFor } from './supervisor';
import AppsJsonSchema from './interface-apps-json';
import { AugmentedHeadersFile, AugmentedHeadersSymlink } from './packer';
import { ImagesbaseAndPreload, ManifestInfosRepos } from './interface-manifest';

export interface PreloadIds {
	appId: string;
	releaseId: string;
}

export interface AppsJsonProp extends PreloadIds {
	appsJson: AppsJsonSchema;
}

export interface PreloadOptions extends PreloadIds {
	outputStream: NodeJS.WritableStream;
	balenaosStream: NodeJS.ReadableStream;
	supervisorVersion: string;
	arch: string;
	balenaosSize: number;
	api: string;
	token: string;
	balenaosRef: string;
	dataPartition: number;
	user: string;
	password: string;
	callback?: (message: string) => void;
}

/**
 * Main Processing function
 *
 * Timing is important.
 * As we're outputing to a tar stream
 * We need to act synchronously as we stream files one at a time in the output pipe
 */
const streamPreloadingAssets = async ({
	outputStream,
	balenaosStream,
	balenaosSize,
	supervisorVersion,
	arch,
	appId,
	releaseId,
	balenaosRef,
	dataPartition = 6,
	api,
	token,
	user,
	password,
	callback,
}: any): Promise<void> => {
	// ##############
	// Processing
	// ##############
	console.log('==> STARTING @streamPreloadingAssets');

	// prepare tarball packer
	const injectPath = `inject/${dataPartition}`;
	const packStream = getTarballStream(outputStream); // streamable
	const packFile = promisePacker(packStream, injectPath); // promise
	const packManifest = promisePacker(packStream); // promise

	// 0. create and stream a manifest
	const manifest = {
		image: balenaosRef,
		inject: [
			{
				partition: dataPartition,
				partitionName: 'resin-data',
				inject: dataPartition,
			},
		],
	};

	await packManifest(
		{ name: 'manifest.json', mode: 644 } as AugmentedHeadersFile,
		JSON.stringify(manifest),
	);

	// Beware that knowing the file size in advance is mandatory
	const baseImageStreamEntry = packStream.entry({
		// TOOD: name: `${balenaosRef}.img`, // switch when inject.mjs select baseimage from manifest (currently hardcoded)
		name: `${balenaosRef}.gz`,
		mode: 644,
		size: balenaosSize,
	});

	// TODO: optimizatinon : // streamBaseImage with all the metadata retrieval and processing (up to getLayers)
	await streamBaseImage({
		pipeStreamFrom: balenaosStream,
		pipeStreamTo: baseImageStreamEntry,
	});

	// get apps.json
	const appsJson = await getAppsJson({ appId, releaseId });

	// extract image_ids from appsJson
	const images = getImageIds({ appsJson, appId, releaseId });

	// get the supervisor image
	const baseImages = [
		{
			imageName: await getSupervisorImageNameFor({
				version: supervisorVersion,
				arch,
				api,
				token,
			}),
			imageHash: 'latest',
			isSupervisor: true,
			supervisorVersion,
		},
	];

	// get manifests from registry for all images including pre-pre-loaded images (the ones inside the base image)
	const imagesbaseAndPreload = [
		...baseImages,
		...images,
	] as ImagesbaseAndPreload[];
	const manifests = await getManifests(imagesbaseAndPreload, {
		username: user,
		password,
	});

	// precompute layers metadata for all layers
	const layers = await getLayers(manifests);

	// download and process layers, this is where most of the work is happening
	const layersInjectableFiles = await downloadProcessLayers({
		manifests,
		layers,
		packStream,
		injectPath,
	});

	// prepare images files
	const imagesInjectableFiles = getImagesConfigurationFiles(manifests);

	// generate repositories.json snipets for each images, merge everything and inject result
	const newRepositoriesJson = buildRepositories(
		manifests as ManifestInfosRepos[],
	);

	// prepare global metadata files
	const globalInjectable = [
		{
			header: { name: repositoriesJsonInjectionPath, mode: 644 },
			content: JSON.stringify(newRepositoriesJson),
		},
		{
			header: { name: 'apps.json', mode: 644 },
			content: JSON.stringify(appsJson),
		},
	];

	// inject all metadata files and folders
	// TODO: fix header type, its getting type error
	for (const { header, content } of [
		...layersInjectableFiles,
		...imagesInjectableFiles,
		...globalInjectable,
	]) {
		await packFile(
			header as AugmentedHeadersSymlink,
			content as string | undefined,
		);
	}

	// close tarball
	await packStream.finalize();
	console.log('==> FINISHED @streamPreloadingAssets');
	console.log(
		'==> change consoleLevel log levels in logger.mjs for less verbose logging',
	);

	if (callback) {
		callback();
	}
};

export { streamPreloadingAssets };
