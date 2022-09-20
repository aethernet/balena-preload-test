declare global {
	namespace NodeJS {
		interface ProcessEnv {
			GITHUB_AUTH_TOKEN: string;
			NODE_ENV: 'development' | 'production';
			PORT?: string;
			APPID: string;
			RELEASEID: string;
			BALENAOS: string;
			USER: string;
			PASSWORD: string;
			TARBALL: 'PathLike';
			BALENAENV: string;
			DEVICEADDRESS: string;
			CONSOLELEVEL: string;
			DATA_PARTITION: string;
			API: string;
			API_TOKEN: string;
			SV_VERSION: string;
			ARCH: string;
			BASEIMAGE: 'PathLike';
			IMAGE: string;
		}
	}
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
