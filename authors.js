const sqlite = require('sqlite');
const XXHash = require('xxhash');
const XRegExp = require('xregexp');
const Int64LE = require('int64-buffer').Int64LE;
const utils = require('./utils');

const Authors = function (options) {
	this.db = options.db;
};

module.exports = Authors;

/**
 * Test if a given author name is a degree or an other forbidden word
 * @param text
 * @return {boolean}
 */
Authors.prototype.isSkipWord = function (text) {
	let list = [
		'by',
		'prof',
		'bsc',
		'dsc',
		'phd',
		'md',
		'mph',
		'rd',
		'ld',
		'bch',
		'fccp',
		'bao',
		'pharmd',
		'frcp',
		'pa-c',
		'rac',
		'mba',
		'drph',
		'mbchb',
		'bm',
		'rgn',
		'ba',
		'ms',
		'msc',
		'sc'
	];
	return list.includes(text.toLowerCase());
};

/**
 * Returns a coefficient representing:
 * when k < 0 word is more likely to be a regular word than an author name
 * when k = 0 word is unknown or can equally be an author name or a regular word
 * when k > 0 word is more likely to be an author name
 * @param text
 * @return {Promise<number>}
 */
Authors.prototype.getWordInfo = async function (text) {
	// Get data about the word from the database
	let row = await this.db.getWord(text);
	
	if (!row) return 0;
	
	// How many times the word was encountered as a:
	let a = row.a; // regular word
	let b = row.b; // first name
	let c = row.c; // last name
	
	// If zero encounters as a first or last name
	if (b + c === 0) return -a;
	
	// If zero encounters as a regular word,
	// return sum of first and last name encounters
	if (a === 0) return b + c;
	
	// Now depending on what is more common for the word (to be a name or a regular word),
	// divide and return how many times it's more common.
	if (b + c > a) {
		return (b + c) / a;
	}
	else if (b + c < a)
		return -a / (b + c);
	else return 0;
};

Authors.prototype.isPrefix = function (text) {
	return /^(van|de|di)$/.test(text);
};

/**
 * Extracts authors from line
 * @param line
 * @return {Array}
 */
Authors.prototype.extractFromLine = function (line) {
	let rxToken = XRegExp('(?![Ææ])[\\p{Letter}-’\'. ]');
	let rxTrim = XRegExp('^[^\\p{Letter}]+|[^\\p{Letter}’\']+$', 'g');
	
	// Walk through the words and make one flat chars array with references to the actual word
	let chars = [];
	for (let word of line.words) {
		for (let c of word.text) {
			chars.push({c, word})
		}
		if (word.space) chars.push({c: ' ', word})
	}
	
	// Ugly fix for pdftotext (xpdf) incorrectly decomposed characters with an accent
	// i.e. "Go´mez" becomes "Gomez", all accents are just ignored. Poppler works ok
	chars = chars.filter(x => !['´', '^', 'ˆ', '¨', '`', '˜', '∼', '¸'].includes(x.c));
	
	// This is a different character than '∼' above. It's often encountered
	// in poorly OCRed PDFs. Have to be removed
	chars = chars.filter(x => x.c !== '~');
	
	// Split the chars array into tokens when non-alphabetic characters or font differences found
	let tokens = [];
	let token = '';
	let prevChar = null;
	let font = 0;
	let fontSize = 0;
	let baseline = 0;
	for (let char of chars) {
		// Split if the current char is not allowed to be in a token. Ignore the current char
		if (!rxToken.test(char.c)) {
			if (token) {
				tokens.push({text: token, font, fontSize, baseline});
				token = '';
			}
		}
		// Split if the previous char has a different font, font size or baseline
		else if (prevChar && (prevChar.word.font !== char.word.font ||
			Math.abs(char.word.fontSize - prevChar.word.fontSize) > 1.0 &&
			Math.abs(char.word.baseline - prevChar.word.baseline) > 1.0)) {
			if (token) {
				tokens.push({text: token, font, fontSize, baseline});
				token = '';
			}
			token += char.c;
			font = char.word.font;
			fontSize = char.word.fontSize;
			baseline = char.word.baseline;
		}
		else {
			token += char.c;
			font = char.word.font;
			fontSize = char.word.fontSize;
			baseline = char.word.baseline;
		}
		
		prevChar = char;
	}
	
	// Push the remaining token
	if (token) tokens.push({text: token, font, fontSize, baseline});
	
	// Get the most common font size and baseline
	let topFontSize = utils.getTopValue(tokens.map(x => ({key: x.fontSize, value: x.text.length})));
	let topBaseline = utils.getTopValue(tokens.map(x => ({key: x.baseline, value: x.text.length})));
	
	// Filter out all tokens that have smaller font or baseline than the most common values
	tokens = tokens.filter(x => topFontSize - x.fontSize <= 1);
	tokens = tokens.filter(x => topBaseline - x.baseline <= 1);
	
	tokens = tokens.map(x => x.text);
	
	// Split and inserted tokens containing more than one word separated with a conjunction
	// i.e. "John Smith and Antonio Alvarez"
	for (let i = 0; i < tokens.length;) {
		let token = tokens[i];
		let parts = token.split(/(?:^| )(?:and|und)(?:$| )/gi);
		if (parts.length >= 2) {
			parts = parts.filter(x => x);
			tokens.splice(i, 1, ...parts);
			i += parts.length;
		}
		else {
			i++;
		}
	}
	
	// Trim non-alphabetic characters
	tokens = tokens.map(x => XRegExp.replace(x, rxTrim, ''));
	
	let authors = [];
	// console.log(tokens);
	// Split tokens to separate names, validate them and construct authors array
	for (let token of tokens) {
		let names = token.split(/[\s\.]/).filter(x => x);
		names = names.filter(x => !this.isSkipWord(x));
		
		// All names must start from upper case or be a surname prefix, otherwise stop parsing
		if (!names.every(x => utils.isUpper(x[0]) || this.isPrefix(x))) break;
		
		// All authors must have between 2 and 4 names
		if (names.length >= 2 && names.length <= 4) {
			// Last name shouldn't be shorter than 2 chars, otherwise stop parsing
			if (names.slice(-1)[0].length < 2) break;
			authors.push(names.slice());
		}
		else if (names.length !== 0 && names.length !== 1) {
			// Stop further parsing
			break;
		}
	}
	
	return authors;
};

/**
 * Extracts authors from PDF file metadata,
 * when author names start with the first name and finish with the last name
 * @param chars Authors lines
 * @return {Promise<array>}
 */
Authors.prototype.extractFromStringType1 = async function (chars) {
	let rxToken = XRegExp('(?![Ææ])[\\p{Letter}\\p{Dash_Punctuation}’\'. ]');
	let rxTrim = XRegExp('^[^\\p{Letter}]+|[^\\p{Letter}]+$', 'g');
	
	let tokens = [];
	let token = '';
	let prevChar = null;
	for (let char of chars) {
		if (!rxToken.test(char)) {
			if (token) {
				tokens.push(token);
				token = '';
			}
		}
		else {
			token += char;
		}
		
		prevChar = char;
	}
	
	if (token) tokens.push(token);
	
	for (let i = 0; i < tokens.length;) {
		let token = tokens[i];
		let parts = token.split(/(?:^| )(?:and|und)(?:$| )/gi);
		if (parts.length >= 2) {
			parts = parts.filter(x => x);
			tokens.splice(i, 1, ...parts);
			i += parts.length;
		}
		else {
			i++;
		}
	}
	
	tokens = tokens.map(x => XRegExp.replace(x, rxTrim, ''));
	
	let authors = [];
	
	for (let token of tokens) {
		let names = token.split(/[\s\.]/).filter(x => x);
		names = names.filter(x => !this.isSkipWord(x));
		if (!names.every(x => utils.isUpper(x[0]))) break;
		if (names.length >= 2 && names.length <= 4) {
			if (names.slice(-1)[0].length < 2) return 0;
			authors.push(names.slice());
		}
		else if (names.length !== 0) {
			break;
		}
	}
	
	let result = [];
	let found = false;
	for (let author of authors) {
		if (!found) {
			for (let name of author) {
				if (name.length >= 3) {
					let type = await this.getWordInfo(name);
					if (type > 0) {
						found = true;
						break;
					}
				}
			}
		}
		
		let firstName;
		let lastName;
		lastName = author.pop();
		firstName = author.join(' ');
		
		result.push({firstName, lastName});
	}
	
	if (found) return result;
	return null;
};

/**
 * Extracts authors from PDF file metadata,
 * when the last name goes first and is separated with a comma
 * @param str
 * @return {Promise<array>}
 */
Authors.prototype.extractFromStringType2 = async function (str) {
	let parts = str.split(/[,;]|and|und/).map(str => str.trim());
	
	let authors = [];
	
	if (parts.length % 2 !== 0) return null;
	
	for (let i = 0; i < parts.length; i += 2) {
		let last = parts[i];
		let first = parts[i + 1];
		
		if (last.split(' ').length > 1) return null;
		
		let names = [];
		
		let ps = first.split(/[. ]/);
		for (let p of ps) {
			if (p.length) names.push(p);
		}
		
		names.push(last);
		authors.push(names);
	}
	
	let result = [];
	let found = false;
	for (let author of authors) {
		if (!found) {
			for (let name of author) {
				if (name.length >= 3) {
					let type = await this.getWordInfo(name);
					if (type > 0) {
						found = true;
						break;
					}
				}
			}
		}
		
		let firstName;
		let lastName;
		lastName = author.pop();
		firstName = author.join(' ');
		
		result.push({firstName, lastName});
	}
	
	if (found) return result;
	return null;
};

/**
 * Blacklist words that are often encountered when extracting authors
 * @param word
 * @return {boolean}
 */
Authors.prototype.isWordBlacklisted = function (word) {
	let list = ['the', 'university', 'school', 'public', 'institute', 'inc'];
	return list.includes(word.toLowerCase());
};

/**
 * Test if authors line has a reference.
 * It increases confidence that we actually found authors line
 * @param line
 * @return {boolean}
 */
Authors.prototype.hasRef = function (line) {
	return /\*|∗|⁎|†|‡|§|¶|⊥|¹|²|³|α|β|λ|ξ|ψ/g.test(line.text);
};

/**
 * Extract authors from a line block
 * @param lb
 * @return {Promise<{authors: Array, conf: number}>}
 */
Authors.prototype.getAuthors = async function (lb) {
	let confidence = 0;
	let result = [];
	
	for (let line of lb.lines) {
		if (line.text.toLowerCase() === 'by') continue;
		
		let authors = this.extractFromLine(line);
		
		let ref = this.hasRef(line);
		
		if (!authors.length) return {
			authors: result, conf: confidence
		};
		
		for (let author of authors) {
			let negative = 0;
			let positive = 0;
			let lastNegativeValue = 0;
			let stop = false;
			for (let name of author) {
				if (this.isWordBlacklisted(name)) {
					stop = true;
					break;
				}
				if (name.length < 2 || this.isPrefix(name)) continue;
				
				let type = await this.getWordInfo(name);
				if (type < 0) {
					negative++;
					lastNegativeValue = type;
				}
				else if (type > 0) {
					positive++;
				}
			}
			
			if (stop) break;
			
			let c = 0;
			
			if (ref) c = 2;
			
			if (negative >= 2 || negative === author.length) {
				break;
			}
			else {
				if (negative === 0) c = 2;
				if (authors.length === 1) {
					if (negative && positive && lastNegativeValue > -30) c = 1;
					//if (negative < author.names.length) c = 1;
				}
				else {
					if (!negative) c = 2;
				}
			}
			
			if (c > confidence) confidence = c;
			
			let firstName;
			let lastName;
			lastName = author.pop();
			if (this.isPrefix(author.slice(-1))) {
				lastName = author.pop() + ' ' + lastName;
				if (this.isPrefix(author.slice(-1))) {
					lastName = author.pop() + ' ' + lastName;
				}
			}
			
			firstName = author.join(' ');
			result.push({firstName, lastName});
		}
	}
	
	return {
		authors: result, conf: confidence
	};
};

/**
 * Tests if two author arrays doesn't share the same authors
 * @param authors1
 * @param authors2
 * @return {boolean}
 */
Authors.prototype.hasExistingAuthor = function (authors1, authors2) {
	for (let author1 of authors1) {
		for (let author2 of authors2) {
			if (author1.firstName === author2.firstName && author1.lastName === author2.lastName) {
				return true;
			}
		}
	}
	return false;
};

/**
 * Extract more authors by searching for line blocks,
 * that are in the same horizontal line, or have the same font.
 * Because initially we are extracting authors only from the line before
 * or after the title, but some PDFs have authors in separate blocks
 * @param lbs Line blocks
 * @param lbi Title line block index
 * @return {Promise<Array>}
 */
Authors.prototype.extractAdditionalAuthors = async function (lbs, lbi) {
	let a1 = [];
	let a2 = [];
	
	let first_lb = lbs[lbi];
	
	// Horizontal authors
	for (let i = lbi; i < lbs.length; i++) {
		let lb = lbs[i];
		if (Math.abs(first_lb.yMin - lb.yMin) < 3.0) {
			let a = await this.getAuthors(lb);
			if (a) {
				if (!this.hasExistingAuthor(a1, a.authors)) {
					a1 = a1.concat(a.authors);
				}
			}
			else {
				break;
			}
		}
	}
	
	// Authors from the same font blocks
	for (let i = lbi; i < lbs.length; i++) {
		let lb = lbs[i];
		if (first_lb.lines[0].words[0].font === lb.lines[0].words[0].font &&
			first_lb.lines[0].words[0].fontSize === lb.lines[0].words[0].fontSize) {
			let a = await this.getAuthors(lb);
			if (a && a.conf === 2) {
				if (!this.hasExistingAuthor(a2, a.authors)) {
					a2 = a2.concat(a.authors);
				}
			}
			else {
				break;
			}
		}
	}
	
	if (a1.length > a2.length) {
		return a1;
	}
	else {
		return a2;
	}
};

/**
 * Tries to extract authors above and below the title
 * @param lbs Line blocks
 * @param lbi Title line block index
 * @return {Promise<Array>}
 */
Authors.prototype.extractAuthorsNearTitle = async function (lbs, lbi) {
	let alb;
	let slb;
	let tlb;
	
	let albi = 0;
	
	let a1 = {conf: 0};
	let a2 = {conf: 0};
	let a3 = {conf: 0};
	
	tlb = lbs[lbi];
	
	// Try the first line below
	if (lbi + 1 < lbs.length) {
		alb = lbs[lbi + 1];
		a1 = await this.getAuthors(alb);
	}
	
	// Try the second line below
	if (lbi + 2 < lbs.length) {
		alb = lbs[lbi + 2];
		slb = lbs[lbi + 1];
		
		let total_chars = 0;
		for (let lines of slb.lines) {
			total_chars += lines.text.length;
		}
		
		if (total_chars < 300 &&
			tlb.maxFontSize >= slb.maxFontSize && tlb.maxFontSize >= alb.maxFontSize &&
			tlb.yMax < slb.yMin && slb.yMax < alb.yMin) {
			a2 = await this.getAuthors(alb);
		}
	}
	
	// Try the line bove
	if (lbi > 0) {
		alb = lbs[lbi - 1];
		if (tlb.maxFontSize >= alb.maxFontSize && tlb.yMin > alb.yMax) {
			a3 = await this.getAuthors(alb);
		}
	}
	
	let authors = [];
	
	if (a1.conf > 0 && a1.conf >= a2.conf && a1.conf >= a3.conf) {
		authors = a1.authors;
		albi = lbi + 1;
	}
	else if (a2.conf > 0 && a2.conf >= a1.conf && a2.conf >= a3.conf) {
		authors = a2.authors;
		albi = lbi + 2;
	}
	else if (a3.conf > 0 && a3.conf >= a1.conf && a3.conf >= a2.conf) {
		authors = a3.authors;
		albi = lbi - 1;
	}
	
	if (authors.length) {
		let a = await this.extractAdditionalAuthors(lbs, albi);
		if (a) authors = a;
	}
	
	return authors;
};
