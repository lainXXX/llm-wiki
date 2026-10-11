'use strict';
/** 源文件指纹：源变更检测（spec §5.1）与幂等判据（§10 B1/B4）都靠它。 */
const crypto = require('crypto');
const fs = require('fs');

function sha256File(file) {
    const h = crypto.createHash('sha256');
    h.update(fs.readFileSync(file));
    return h.digest('hex');
}

/** frontmatter 里的 sha256 只存前 12 位，够判变化且不污染页面。 */
function short(hash) {
    return String(hash).slice(0, 12);
}

module.exports = { sha256File, short };
