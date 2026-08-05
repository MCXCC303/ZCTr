// ===== ZCTr 持久化缓存诊断 =====
// Run JavaScript 中执行，把 alert 内容发我
(async () => {
	let out = [];
	// 1. prefs 状态
	try {
		out.push('cachePersist: ' + Zotero.Prefs.get('extensions.zotero.zctr.cachePersist', true));
		out.push('cacheLimit: ' + Zotero.Prefs.get('extensions.zotero.zctr.cacheLimit', true));
	} catch (e) {
		out.push('prefs THREW: ' + (e && e.message ? e.message : e));
	}
	// 2. 缓存文件
	try {
		let dir = Zotero.getZoteroDirectory().clone();
		dir.append('zctr');
		out.push('cache dir exists: ' + dir.exists());
		let file = dir.clone();
		file.append('cache.json');
		out.push('cache file exists: ' + file.exists());
		if (file.exists()) {
			let content = Zotero.File.getContentsFromFile(file);
			out.push('file size: ' + content.length + ' chars');
			let list = JSON.parse(content);
			out.push('entries: ' + (Array.isArray(list) ? list.length : 'NOT ARRAY'));
			if (Array.isArray(list) && list.length) {
				out.push('first entry keys: ' + JSON.stringify(Object.keys(list[0])));
				out.push('first text head: ' + String(list[0].text).slice(0, 30));
				out.push('first targetLang: ' + list[0].targetLang + ' | providerId: ' + list[0].providerId);
			}
		}
	} catch (e) {
		out.push('file check THREW: ' + (e && e.message ? e.message : e));
	}
	alert(out.join('\n'));
})();
