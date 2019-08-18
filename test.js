const regExp = /([a-z]|[-])+/;

const str = "和";
const match = str.match(regExp);
console.log(match && match[0] === match.input);
