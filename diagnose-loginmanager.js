// ===== ZCTr API Key 存储诊断（LoginManager）=====
// Run JavaScript 中执行，把 alert 内容发我
(async () => {
    let out = [];
    // 1. Services.logins 可用性与已存密钥
    try {
        out.push('1. Services.logins: ' + (Services.logins ? 'OK' : 'NULL'));
        let logins = Services.logins.findLogins('https://zctr.local', '', '');
        out.push('2. zctr logins count: ' + logins.length);
        for (let l of logins) {
            out.push('   user=' + l.username + ' | pw=' + (l.password ? '***(' + l.password.length + ' chars)' : 'EMPTY'));
        }
    } catch (e) {
        out.push('1/2. Services.logins THREW: ' + (e && e.message ? e.message : e));
    }
    // 3. 测试 addLogin（用测试数据）
    try {
        let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init('https://zctr.local', '', '', 'zctr:diag', 'diag-key', '', '');
        Services.logins.addLogin(login);
        out.push('3. addLogin OK');
        Services.logins.removeLogin(login);
        out.push('   removeLogin OK');
    } catch (e) {
        out.push('3. addLogin THREW: ' + (e && e.message ? e.message : e));
    }
    // 4. 检查当前激活供应商与 providers 状态
    try {
        let providers = JSON.parse(Zotero.Prefs.get('extensions.zotero.zctr.providers', true) || '[]');
        let activeId = Zotero.Prefs.get('extensions.zotero.zctr.activeProviderId', true);
        out.push('4. activeId: ' + activeId);
        out.push('5. providers: ' + JSON.stringify(providers.map(p => ({
            id: p.id,
            type: p.type,
            name: p.name,
            hasPlainKey: !!p.apiKey
        }))));
        // 尝试读取每个 provider 的 key
        for (let p of providers) {
            try {
                let found = Services.logins.findLogins('https://zctr.local', '', '');
                let key = '';
                for (let l of found) {
                    if (l.username === 'zctr:' + p.id) key = l.password || '';
                }
                out.push('   provider ' + p.id + ' (' + p.name + '): keyInLoginManager=' + (key ? 'YES(' + key.length + ')' : 'NO'));
            } catch (e) {
                out.push('   provider ' + p.id + ': read THREW ' + (e && e.message ? e.message : e));
            }
        }
    } catch (e) {
        out.push('4/5. prefs THREW: ' + e);
    }
    alert(out.join('\n'));
})();
