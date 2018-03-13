const sqlite = require('sqlite');
const XXHash = require('xxhash');
const XRegExp = require('xregexp');
const Int64LE = require("int64-buffer").Int64LE;

const reg1 = XRegExp('[\\p{Letter}]');
const reg2 = XRegExp('[\\p{Letter}\\p{Dash_Punctuation}`\']');

function normalize(text) {
	let rx = XRegExp('[^\\pL]', 'g');
	text = XRegExp.replace(text, rx, '');
	text = text.normalize('NFKD');
	text = XRegExp.replace(text, rx, '');
	text = text.toLowerCase();
	
	return text;
}

const Authors = function (options) {
	this.db = options.db;
};

module.exports = Authors;

Authors.prototype.lineToUstr = function (line) {
	let ustr = [];
	for (let word of line.words) {
		for (let c of word.text) {
			ustr.push({c, word});
		}
		if (word.space) ustr.push({c: ' ', word});
	}
	return ustr;
};

Authors.prototype.isConjunction = function (name) {
	let list = ['and', 'und'];
	return list.includes(name.toLowerCase());
};

Authors.prototype.isSkipWord = function (name) {
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
		'msc'
	];
	return list.includes(name.toLowerCase());
};

Authors.prototype.extractAuthorsFromUstr = function (ustr) {
	let authors = [];
	let names = [];
	let name = '';
	let font = null;
	let fontsize = 0;
	let baseline = 0;
	
	let ref = 0;
	
	let that = this;
	
	for (let i = 0; i < ustr.length; i++) {
		
		let uchar = ustr[i];
		
		function fn1() {
			
			if (uchar.c === '~') return 1;
			
			if (!name.length) {
				if ([' ', '.'].includes(uchar.c)) { // Skip all spaces before name
					return 1;
				}
				
				if (font !== null && uchar.word.font !== font || fontsize > 1 && Math.abs(uchar.word.fontsize - fontsize) > 1.0 &&
					Math.abs(uchar.word.baseline - baseline) > 1.0) {
					ref = 1;
					return 2;
				}
				
				if (reg1.test(uchar.c) && !/[Ææ]/.test(uchar.c)) {
					name += uchar.c;
					
					if (!names.length) {
						font = uchar.word.font;
						fontsize = uchar.word.fontsize;
						baseline = uchar.word.baseline;
					}
				}
				else { // If symbol is not a letter
					return 2;
				}
				
			}
			else {
				if (font !== null && uchar.word.font !== font || Math.abs(uchar.word.fontsize - fontsize) > 1.0 && Math.abs(uchar.word.baseline - baseline) > 1.0 ||
					uchar.c === '*') {
					ref = 1;
					return 2;
				}
				else if (reg2.test(uchar.c) && !/[Ææ]/.test(uchar.c)) {
					name += uchar.c;
				}
				else if ([' ', '.'].includes(uchar.c)) { // if names separator
					
					if (that.isConjunction(name)) {
						name = '';
						return 2;
					}
					
					if (that.isSkipWord(name)) {
						//names = [];
						name = '';
						return 2;
					}
					
					if (name[0].toUpperCase() !== name[0]) { // if name doesn't start with upper case letter. todo: what about chinese?
						name = '';
						return 2;
					}
					
					names.push(name.slice());
					name = '';
					
					if (names.length >= 4) {
						return 2;
					}
				}
				else {
					return 2;
				}
			}
		}
		
		let r = fn1();
		
		if (r === 1) continue;
		if (r !== 2 && i < ustr.length - 1) continue;
		
		
		if (this.isConjunction(name)) {
			name = '';
		}
		
		if (this.isSkipWord(name)) {
			name = '';
			//names = [];
		}
		
		if (name.length) {
			names.push(name.slice());
			name = '';
		}
		
		if (names.length >= 2 && names.length <= 4) {
			if (names[names.length - 1].length < 2) return 0;
			authors.push({ref, names: names.slice()});
			ref = 0;
		}
		else if (names.length !== 0) {
			//return 0;
			break;
		}
		
		name = '';
		names = [];
		font = null;
	}
	
	return authors;
	
};

Authors.prototype.getWordType = async function (word) {
	let row = await this.db.getWord(word);
	
	if (!row) return 0;
	
	let a = row.a;
	let b = row.b;
	let c = row.c;
	
	if (b + c === 0) return -a;
	if (a === 0) return b + c;
	
	if (b + c > a) {
		return (b + c) / a;
	}
	else if (b + c < a)
		return -a / (b + c);
	else return 0;
};

Authors.prototype.getAuthors = async function (lb) {
	let confidence = 0;
	
	let result = [];
	
	for (let line of lb.lines) {
		
		// console.log('uline', line.text);
		let ustr = this.lineToUstr(line);
		
		let authors = this.extractAuthorsFromUstr(ustr);
		
		if (!authors.length) return {
			authors: result, conf: confidence
		};
		
		for (let author of authors) {
			let negative = 0;
			let positive = 0;
			for (let name of author.names) {
				if (name.length < 3) continue;
				
				let type = await this.getWordType(name);
				if (type < 0) {
					negative++;
				}
				else if (type > 0) {
					positive++;
				}
				// console.log('nnn',name, type);
			}
			
			let c = 0;
			
			if (author.ref) c = 2;
			
			if (negative >= 2 || negative === author.length) {
				break;
			}
			else {
				if (negative === 0) c = 2;
				if (authors.length === 1) {
					if (negative && positive) c = 1;
					//if (negative < author.names.length) c = 1;
				}
				else {
					if (!negative) c = 2;
				}
			}
			
			if (c > confidence) confidence = c;
			
			let firstName;
			let lastName;
			lastName = author.names.pop();
			firstName = author.names.join(' ');
			result.push({firstName, lastName});
			
		}
		
		// console.log(authors);
	}
	
	return {
		authors: result, conf: confidence
	};
};

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

Authors.prototype.extractAdditionalAuthors = async function (lbs, lbi) {
	
	let a1 = [];
	let a2 = [];
	
	let first_lb = lbs[lbi];
	
	// Horizontal authors
	for (let i = lbi; i < lbs.length; i++) {
		let lb = lbs[i];
		if (Math.abs(first_lb.yMin - lb.yMin) < 3.0) {
//      printf("found another author block:\n");
//      print_block(lb);
//      printf("\n\n");
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
			first_lb.lines[0].words[0].fontsize === lb.lines[0].words[0].fontsize) {
//      printf("found another author block:\n");
//      print_block(lb);
//      printf("\n\n");
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
	
	//printf("more authors: %s\n", a2_str);
};

Authors.prototype.extractAuthors = async function (lbs, i) {
	let alb;
	let slb;
	let tlb;
	
	let a_i = 0;
	
	let a1 = {conf: 0};
	let a2 = {conf: 0};
	let a3 = {conf: 0};
	
	tlb = lbs[i];
	
	if (i + 1 < lbs.length) {
		alb = lbs[i + 1];
		a1 = await this.getAuthors(alb);
	}
	
	if (i + 2 < lbs.length) {
		alb = lbs[i + 2];
		slb = lbs[i + 1];
		
		let total_chars = 0;
		for (let lines of slb.lines) {
			total_chars += lines.text.length;
		}
		
		if (total_chars < 300 && slb.yMin - tlb.yMax < (alb.yMin - slb.yMax) * 2 &&
			tlb.maxFontSize >= slb.maxFontSize && tlb.maxFontSize >= alb.maxFontSize &&
			tlb.yMax < slb.yMin && slb.yMax < alb.yMin) {
			a2 = await this.getAuthors(alb);
		}
	}
	
	if (i > 0) {
		alb = lbs[i - 1];
		if (tlb.maxFontSize >= alb.maxFontSize && tlb.yMin > alb.yMax) {
			a3 = await this.getAuthors(alb);
		}
	}
	
	let authors = [];
	
	if (a1.conf > 0 && a1.conf >= a2.conf && a1.conf >= a3.conf) {
		authors = a1.authors;
		a_i = i + 1;
	}
	else if (a2.conf > 0 && a2.conf >= a1.conf && a2.conf >= a3.conf) {
		authors = a2.authors;
		a_i = i + 2;
	}
	else if (a3.conf > 0 && a3.conf >= a1.conf && a3.conf >= a2.conf) {
		authors = a3.authors;
		a_i = i - 1;
	}
	
	if (authors.length) {
		let a = await this.extractAdditionalAuthors(lbs, a_i);
		if (a) {
			authors = a;
		}
	}
	
	return authors;
};
