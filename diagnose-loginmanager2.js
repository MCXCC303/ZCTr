// ===== ZCTr API Key 存储诊断 v2（addLoginAsync 链路）=====
(async () => {
    let out = [];
    // 1. 已存密钥
    try {
        let logins = Services.logins.findLogins('https://zctr.local', '', '');
        out.push('1. logins count: ' + logins.length);
        for (let l of logins) {
            out.push('   ' + l.username + ' => ' + (l.password ? '***(' + l.password.length + ')' : 'EMPTY'));
        }
    } catch (e) {
        out.push('1. findLogins THREW: ' + (e && e.message ? e.message : e));
    }
    // 2. 直接测试 addLoginAsync（完整链路 + 读取验证）
    try {
        let login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
        login.init('https://zctr.local', '', '', 'zctr:diag2', 'diag-key-456', '', '');
        let r = await Services.logins.addLoginAsync(login);
        out.push('2. addLoginAsync OK, result: ' + JSON.stringify(r));
        let found = Services.logins.findLogins('https://zctr.local', '', '');
        out.push('   after add, count: ' + found.length);
        let matched = found.find(l => l.username === 'zctr:diag2');
        out.push('   matched pw: ' + (matched ? matched.password : 'NOT FOUND'));
        Services.logins.removeLogin(login);
        out.push('   cleanup OK');
    } catch (e) {
        out.push('2. addLoginAsync THREW: ' + (e && e.message ? e.message : e) + ' || ' + (e && e.stack ? e.stack.slice(0, 400) : ''));
    }
    // 3. active 供应商匹配
    try {
        let providers = JSON.parse(Zotero.Prefs.get('extensions.zotero.zctr.providers', true) || '[]');
        let activeId = Zotero.Prefs.get('extensions.zotero.zctr.activeProviderId', true);
        let active = providers.find(p => p.id === activeId);
        out.push('3. active: ' + (active ? active.name + ' (' + active.type + ')' : 'NOT FOUND'));
    } catch (e) {
        out.push('3. prefs THREW: ' + e);
    }
    alert(out.join('\n'));
})();
