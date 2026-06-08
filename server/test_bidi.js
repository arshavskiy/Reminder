const bidiFactory = require('bidi-js');
const bidi = bidiFactory();
function toVisual(str) {
  const levels = bidi.getEmbeddingLevels(str, 'rtl');
  return bidi.getReorderedString(str, levels);
}
console.log(JSON.stringify(toVisual('שם: במת הרמה טלסקופית')));
console.log(JSON.stringify(toVisual('יצרן: MANITOU')));
console.log(JSON.stringify(toVisual('מספר סידורי: 233-017')));
console.log(JSON.stringify(toVisual('לקוח: שי מגן מלגזות')));
