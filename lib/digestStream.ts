import { Transform } from 'stream';
import { createHash } from 'crypto';

// minimal typescript reimplementation of https://github.com/jeffbski/digest-stream/blob/master/lib/digest-stream.js

const digestStream = (
	exfiltrate: (arg0: string, arg1: number) => void,
): Transform => {
	const digester = createHash('sha256');
	let length = 0;

	const hashThrough = new Transform({
		transform(chunk: Buffer, _, callback) {
			digester.update(chunk);
			length += chunk.length;
			callback();
		},
	});

	hashThrough.on('end', () => {
		// 		getEndDatetime(): string;
		// getEndDatetime(startTime: string, duration: number): string;
		// getEndDatetime(startTime?: string, duration?: number): string {
		exfiltrate(digester.digest('hex'), length);
	});

	return hashThrough;
};

export { digestStream };
