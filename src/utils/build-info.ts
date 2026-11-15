/** Addon version (from package.json at build time). */
export const BUILD_VERSION: string = __zctr_build_version__;
/** Short git commit hash; "" for tagged releases (or when not a git checkout). */
export const BUILD_GIT_HASH: string = __zctr_git_hash__;
/** True when built from an exact tagged release commit. */
export const BUILD_IS_RELEASE: boolean = __zctr_is_release__;

export function getVersionedDirName(prefix: string): string {
	const base = `${prefix}-v${BUILD_VERSION}`;
	if (!BUILD_IS_RELEASE && BUILD_GIT_HASH) {
		return `${base}+g${BUILD_GIT_HASH}`;
	}
	return base;
}

export function getCacheSubdirName(): string {
	return getVersionedDirName("cache");
}

export function getTermbaseSubdirName(): string {
	return getVersionedDirName("termbases");
}
