declare const _globalThis: {
	[key: string]: any;
	Zotero: _ZoteroTypes.Zotero;
	ztoolkit: ZToolkit;
	addon: typeof addon;
};

declare type ZToolkit = ReturnType<
	typeof import("../src/utils/ztoolkit").createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import("../src/addon").default;

declare const __env__: "production" | "development";

/** Build-time injected addon version (see zotero-plugin.config.ts). */
declare const __zctr_build_version__: string;
/** Build-time injected short git commit hash ("" for tagged releases). */
declare const __zctr_git_hash__: string;
/** Build-time injected flag: true when built from an exact tagged release. */
declare const __zctr_is_release__: boolean;
