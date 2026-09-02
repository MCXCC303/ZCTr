/**
 * Build-time information injected by zotero-plugin.config.ts (esbuild define).
 *
 * Used for translation-cache isolation: each build writes into its own cache
 * subdirectory, so a development build never pollutes the released addon's
 * cache, and rolling back to a published xpi keeps its previous cache intact.
 */

/** Addon version (from package.json at build time). */
export const BUILD_VERSION: string = __zctr_build_version__;
/** Short git commit hash; "" for tagged releases (or when not a git checkout). */
export const BUILD_GIT_HASH: string = __zctr_git_hash__;
/** True when built from an exact tagged release commit. */
export const BUILD_IS_RELEASE: boolean = __zctr_is_release__;

/**
 * Versioned per-build subdirectory name for build-scoped user data
 * (translation cache AND termbases), isolating each build:
 * - release: `<prefix>-v<version>`           (e.g. termbases-v0.1.2)
 * - dev:     `<prefix>-v<version>+g<commit>` (e.g. termbases-v0.1.2+g6a4f288)
 */
export function getVersionedDirName(prefix: string): string {
	const base = `${prefix}-v${BUILD_VERSION}`;
	if (!BUILD_IS_RELEASE && BUILD_GIT_HASH) {
		return `${base}+g${BUILD_GIT_HASH}`;
	}
	return base;
}

/**
 * Cache subdirectory name (per-build isolation for the disposable
 * translation cache).
 */
export function getCacheSubdirName(): string {
	return getVersionedDirName("cache");
}

/**
 * Termbase subdirectory name (per-build isolation for the termbase
 * manager). Same policy as the cache: a dev build never sees the release
 * build's termbases, and rolling back keeps the other build's data intact.
 */
export function getTermbaseSubdirName(): string {
	return getVersionedDirName("termbases");
}
