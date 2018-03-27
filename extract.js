/*
 ***** BEGIN LICENSE BLOCK *****
 
 This file is part of the Zotero Data Server.
 
 Copyright © 2018 Center for History and New Media
 George Mason University, Fairfax, Virginia, USA
 http://zotero.org
 
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.
 
 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 
 ***** END LICENSE BLOCK *****
 */

const XRegExp = require('xregexp');
const utils = require('./utils');

const Extract = function (options) {
	this.db = options.db;
};

module.exports = Extract;

Extract.prototype.isbn = function (text) {
	let rx = /(SBN|sbn)[ \u2014\u2013\u2012-]?(10|13)?[: ]*([0-9X][0-9X \u2014\u2013\u2012-]+)/g;
	let m;
	while (m = rx.exec(text)) {
		let isbn = m[3].replace(/[^0-9X]/gi, '');
		
		if (isbn.length === 10 || isbn.length === 13) {
			return isbn;
		}
		
		if (isbn.length === 20 || isbn.length === 26) {
			return isbn.slice(0, isbn.length / 2);
		}
		
		if (isbn.length === 23) {
			let isbn13 = isbn.slice(0, 13);
			let isbn10 = isbn.slice(0, 10);
			if (utils.isValidIsbn(isbn13)) return isbn13;
			if (utils.isValidIsbn(isbn10)) return isbn10;
		}
	}
	return null;
};

Extract.prototype.arxiv = function (text) {
	let m = /arXiv:([a-zA-Z0-9\.\/]+)/g.exec(text);
	
	if (m) return m[1];
	return null;
};

Extract.prototype.issn = function (text) {
	let m = /ISSN:? *(\d{4}[-]\d{3}[\dX])/g.exec(text);
	
	if (m) return m[1];
	return null;
};

Extract.prototype.year = function (text) {
	let rx = /(^|\(|\s|,)([0-9]{4})(\)|,|\s|$)/g;
	
	let m;
	if (m = rx.exec(text)) {
		let year = m[2];
		
		year = parseInt(year);
		
		if (year >= 1800 && year <= 2030) {
			return year.toString();
		}
	}
	
	return null;
};

Extract.prototype.volume = function (text) {
	let m = /\b(?:volume|vol|v)\.?[\s:-]\s*(\d+)/i.exec(text);
	if (m) {
		let vol = m[1];
		if (vol.length <= 4) return vol;
	}
	return null;
};

Extract.prototype.issue = function (text) {
	let m = /\b(?:issue|num|no|number|n)\.?[\s:-]\s*(\d+)/i.exec(text);
	if (m) {
		let no = m[1];
		if (no.length <= 4) return no;
	}
	return null;
};

Extract.prototype.cleanInvalidParentheses = function (text) {
	let text2 = '';
	let depth = 0;
	for (let c of text) {
		if ([']', ')'].includes(c)) {
			depth--;
			if (depth < 0) break;
		}
		if (['[', '('].includes(c)) {
			depth++;
		}
		text2 += c;
	}
	return text2;
};

Extract.prototype.doi = async function (doc) {
	let text = '';
	
	if (doc.pages.length >= 1) {
		text += doc.pages[0].text;
	}
	
	if (doc.pages.length >= 2) {
		text += '\n' + doc.pages[1].text;
	}
	
	let m = text.match(/10.\d{4,9}\/[^\s]*[^\s\.,]/g);
	if (!m) return null;
	
	for (let doi of m) {
		doi = this.cleanInvalidParentheses(doi);
		
		let cs = [];
		for (let c of doi) {
			if (c >= 'A' && c <= 'Z') c = c.toLowerCase();
			cs.push(c);
		}
		doi = cs.join('');
		
		return doi;
	}
	return null;
};

Extract.prototype.journal = async function (text) {
	let rx = XRegExp('([\\p{Letter}\'\.]+ )*[\\p{Letter}\'\.]+');
	let m;
	let pos = 0;
	while (m = XRegExp.exec(text, rx, pos)) {
		pos = m.index + m[0].length;
		let name = m[0];
		let nameParts = name.split(' ');
		let namePartsNum = nameParts.length;
		if (namePartsNum < 2) continue;
		
		if (await this.db.journalExists(name)) {
			return name;
		}
	}
	return null;
};

Extract.prototype.keywords = function (doc) {
	for (let i = 0; i < doc.pages.length && i < 2; i++) {
		let page = doc.pages[i];
		
		let lbs = [];
		for (let flow of page.flows) {
			for (let block of flow.blocks) {
				for (let i = 0; i < block.lines.length; i++) {
					let line = block.lines[i];
					
					if (!line.words.length) continue;
					
					let lastLb = null;
					let prevWord = null;
					
					if (lbs.length) {
						lastLb = lbs[lbs.length - 1];
						let prevLine = lastLb.lines[lastLb.lines.length - 1];
						prevWord = prevLine.words[prevLine.words.length - 1];
					}
					
					if (!(prevWord &&
						prevWord.font === line.words[0].font &&
						line.yMin - prevWord.yMax < prevWord.fontsize / 2)) {
						lbs.push({
							lines: [line]
						});
					}
					else {
						lastLb.lines.push(line);
					}
				}
			}
		}
		
		for (let j = 0; j < lbs.length; j++) {
			let lb = lbs[j];
			let text = '';
			for (let line of lb.lines) {
				text += line.text;
				if (text[text.length - 1] === '-') {
					text = text.slice(0, text.length - 2);
				}
				else {
					if (j + 1 !== lbs.length) text += ' ';
				}
			}
			
			if (!utils.isUpper(text[0])) continue;
			
			let m = /^(keywords|key words|key-words|indexing terms)[ :\-—]*(.*)/i.exec(text);
			
			if (m) {
				let parts = m[2].split(/[;,.·—]/);
				
				let keywords = [];
				let skip = false;
				for (let part of parts) {
					part = part.trim();
					if (!part.length) continue;
					if (part.length <= 2 || part.split(' ').length > 3) {
						skip = true;
						break;
					}
					keywords.push(part);
				}
				
				if (skip) continue;
				
				if (keywords.length < 2) continue;
				
				return keywords;
			}
		}
	}
	return null;
};
