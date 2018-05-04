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
	let isbns = [];
	let rx = /(SBN|sbn)[ \u2014\u2013\u2012-]?(10|13)?[: ]*([0-9X][0-9X \u2014\u2013\u2012-]+)/g;
	let m;
	while (m = rx.exec(text)) {
		let isbn = m[3].replace(/[^0-9X]/gi, '');
		
		// If ISBN-10 or ISBN-13 is found
		if (isbn.length === 10 || isbn.length === 13) {
			isbns.push(isbn);
			continue;
		}
		
		// Sometimes ISBN aren't separated with space
		// If two ISBN-10 or two ISBN-13 detected
		if (isbn.length === 20 || isbn.length === 26) {
			// Just slice the first one
			isbns.push(isbn.slice(0, isbn.length / 2));
			continue;
		}
		
		// If mixed ISBN-10 and ISBN-13 pair found, we don't know what is the length of the first one
		if (isbn.length === 23) {
			// Slice both ISBNs, validate, and one of them should be correct
			let isbn13 = isbn.slice(0, 13);
			let isbn10 = isbn.slice(0, 10);
			if (utils.isValidIsbn(isbn13)) isbns.push(isbn13);
			if (utils.isValidIsbn(isbn10)) isbns.push(isbn10);
		}
	}
	
	// Return the first found ISBN, but only if no more than 3 ISBNs are found.
	// Sometimes books have three correct ISBNs i.e. ISBN-10, ISBN-13, e-ISBN,
	// but if there are more than three of them, it definitely means that the
	// book is referencing other books, therefore detecting its own ISBN becomes impossible
	return isbns.length >= 1 && isbns.length <= 3 ? isbns[0] : null;
};

Extract.prototype.arxiv = function (text) {
	let m = /arXiv: ?((([\-A-Za-z\.]+\/\d{7})(?:(v[0-9]+)|)(?!\d))|((\d{4}.\d{4,5})(?:(v[0-9]+)|)(?!\d)))/g.exec(text);
	if (m) return m[3] || m[6];
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

/**
 * Sometimes DOI extraction results in incorrect DOI because
 * it was in round or square brackets. But DOI can have brackets too.
 * This function analyses opening and closing brackets and detects
 * where is the actual end of the DOI
 * i.e "(10.1016/s1474-5151(03)00108-7)" is extracted as "10.1016/s1474-5151(03)00108-7)"
 * and this functions fixes it to "10.1016/s1474-5151(03)00108-7"
 * @param text
 * @return {string}
 */
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

/**
 * Extract DOI from document text
 * @param doc
 * @return {Promise<*>}
 */
Extract.prototype.doi = async function (doc) {
	let text = '';
	
	if (!doc.pages.length) return 0;
	
	if (doc.pages.length >= 1) {
		text += doc.pages[0].text;
	}
	
	if (doc.pages.length >= 2) {
		text += '\n' + doc.pages[1].text;
	}
	
	let m = text.match(/10.\d{4,9}\/[^\s]*[^\s\.,]/g);
	if (!m) return null;
	
	for (let doi of m) {
		// Clean "10.1016/s1474-5151(03)00108-7)"
		doi = this.cleanInvalidParentheses(doi);
		
		// ASCII letters in DOI are case insensitive
		doi = doi.split('').map(c => (c >= 'A' && c <= 'Z') ? c.toLowerCase() : c).join('');
		
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
		
		// Journal name must be have at least two words
		if (name.split(' ').length < 2) continue;
		
		// It must exist in our database
		if (await this.db.journalExists(name)) {
			return name;
		}
	}
	return null;
};

Extract.prototype.keywords = function (doc) {
	
	// Search for keywords in the first two pages only
	for (let page of doc.pages.slice(0, 2)) {
		
		// Group lines to line blocks. Similarly to lbs.js
		// but much simpler, optimized for keywords.
		// Lines must be grouped because keywords sometimes are wrapped
		// Therefore we need to group them together, but separate from all other text too
		let lbs = [];
		
		for (let line of page.lines) {
			
			// Line must have words
			if (!line.words.length) continue;
			
			let lastLb = null;
			let prevWord = null;
			
			// Try to get the line (and the last word) from the previous line block
			if (lbs.length) {
				lastLb = lbs.slice(-1)[0];
				let prevLine = lastLb.lines.slice(-1)[0];
				prevWord = prevLine.words.slice(-1)[0];
			}
			
			// To group this line with the previous line we have to compare
			// the last word from the previous line with the first
			// word from the current line.
			// Fonts must be equal, and line spacing should be small enough
			if (
				prevWord &&
				prevWord.font === line.words[0].font &&
				line.yMin - prevWord.yMax < prevWord.fontSize / 2
			) {
				lastLb.lines.push(line);
			}
			// Or just create a new line block
			else {
				lbs.push({
					lines: [line]
				});
			}
		}
		
		
		for (let lb of lbs) {
			let text = '';
			for (let line of lb.lines) {
				text += line.text;
				if (text.slice(-1)[0] === '-') {
					text = text.slice(0, -1);
				}
				else {
					text += ' ';
				}
			}
			
			// Keyword title must start with an upper case letter
			if (!utils.isUpper(text[0])) continue;
			
			let m = /^(keywords|key words|key-words|indexing terms)[ :\-—]*(.*)/i.exec(text);
			
			if (m) {
				let keywords = m[2].split(/[;,.·—]/);
				keywords = keywords.map(x => x.trim()).filter(x => x);
				// If there are keywords that are 1-2 character length or more than three words length,
				// we don't risk and stop keywords extraction
				if (keywords.some(x => x.length > 0 && x.length <= 2 || x.split(' ').length > 3)) return null;
				if (keywords.length < 2) return null;
				return keywords;
			}
		}
	}
	return null;
};
