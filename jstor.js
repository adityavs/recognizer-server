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

const Jstor = function () {

};

module.exports = Jstor;

Jstor.prototype.getData = function (lbs) {
	for (let lb of lbs) {
		let text = '';
		for (let line of lb.lines) {
			text += line.text + '\n';
			if (line.text.indexOf('Stable URL: http://www.jstor.org/stable/') === 0) {
				return text;
			}
		}
	}
	return null;
};

Jstor.prototype.extract = function (page) {
	let result = {authors: []};
	let authors = '';
	let source = '';
	let published_by = '';
	
	let text = '';
	
	if (!(text = this.getData(page.lbs))) return 0;
	
	let is_book = 0;
	let text_start = text;
	
	// text_start = text.indexOf('Chapter Title: ');
	//
	// if (text_start) {
	// 	is_book = 1;
	// } else {
	// 	text_start = text.indexOf('\n\n');
	// 	if (text_start) {
	// 		text_start += 2;
	// 	}
	// }
	//
	// if (!text_start) text_start = text;
	
	// console.log("text block:", text.slice(text_start));
	
	let m;
	
	if (m = /Stable URL: (http:\/\/www\.jstor\.org\/stable\/(\S+))/.exec(text)) {
		result.url = m[1];
		result.doi = '10.2307/' + m[2];
	}
	else {
		return 0;
	}
	
	if (is_book) {
		// result.type = 'book-chapter';
		// if (m = /Chapter Title: ((?:\n|.)*)\nChapter Author\(s\): ((?:\n|.)*)\n\n/.exec(text_start)) {
		// 	// strcpy(result->title, groups[0]);
		// 	// strcpy(authors, groups[1]);
		// 	result.title = m[1];
		// 	authors = m[2];
		// 	console.log(m);
		// }
		// else if (m = /Chapter Title: ((?:\n|.)*)\n\n/.exec(text_start)) {
		// 	// strcpy(result->title, groups[0]);
		// 	result.title = m[1];
		// 	console.log(m);
		// }
		//
		// if (m = /Book Title: ((?:\n|.)*?)\n(Book |Published by: )/.exec(text_start)) {
		// 	//strcpy(result->container, groups[0]);
		// 	result.container = m[1];
		// 	console.log(m);
		// }
		//
		// if (m = /Book Subtitle: ((?:\n|.)*?)\n(Book |Published by: )/.exec(text_start)) {
		// 	// strcat(result->container, ": ");
		// 	// strcat(result->container, groups[0]);
		// 	result.container += ':' + m[1];
		// 	console.log(m);
		// }
		//
		// if (!authors && (m = /Book Author\(s\): ((?:\n|.)*?)\n(Book |Published by: )/.exec(text_start))) {
		// 	// strcpy(authors, groups[0]);
		// 	authors = m[1];
		// 	console.log(m);
		// }
		//
		// if (m = /Published by: ((?:\n|.)*?)\nStable URL: "/.exec(text_start)) {
		// 	// strcat(published_by, groups[0]);
		// 	published_by = m[1];
		// 	console.log(m);
		// }
	}
	else {
		
		result.type = 'journal-article';
		if (m = /((?:\n|.)*)\nAuthor\(s\): (.*)\nReview by: (.*)\nSource: (.*)\n/.exec(text_start)) {
			result.title = m[1];
			authors = m[3];
			source = m[4];
		}
		else if (m = /((?:\n|.)*)\nAuthor\(s\): (.*)\nSource: (.*)\n/.exec(text_start)) {;
			result.title = m[1];
			authors = m[2];
			source = m[3];
		}
		else if (m = /((?:\n|.)*)\nReview by: (.*)\nSource: (.*)\n/.exec(text_start)) {
			result.title = m[1];
			authors = m[2];
			source = m[3];
		}
		else if (m = /((?:\n|.)*)\nSource: (.*)\n/.exec(text_start)) {
			result.title = m[1];
			source = m[2];
		}
	}
	
	if (authors) {
		let s = 0;
		let e;
		while (1) {
			e = authors.indexOf(', ', s);
			if (e >= 0) {
				result.authors.push({lastName: authors.slice(s, e)});
				s = e + 2;
				continue;
			}
			
			e = authors.indexOf(' and ', s);
			if (e >= 0) {
				result.authors.push({lastName: authors.slice(s, e)});
				s = e + 5;
				continue;
			}
			
			result.authors.push({lastName: authors.slice(s)});
			break;
		}
	}
	
	let vol;
	let no;
	let pg;
	
	vol = source.indexOf(', Vol. ');
	
	if (vol >= 0) {
		let c = vol + 7;
		
		let a;
		if ((a = source.indexOf(' ', c)) || (a = source.indexOf(',', c)) || (a = source.indexOf('\n', c))) {
			result.volume = source.slice(c, a-1);
		}
		
		result.container = source.slice(0, vol);
	}
	
	no = source.indexOf(', No. ');
	
	if (no >= 0) {
		let c = no + 6;
		
		let a;
		if ((a = source.indexOf(' ', c)) || (a = source.indexOf(',', c)) || (a = source.indexOf('\n', c))) {
			result.issue = source.slice(c, a);
		}
		
		if (!result.container) result.container = source.slice(0, no);
	}
	
	if (m = /([0-9]{4})\)/.exec(source)) {
		result.year = m[1];
	}
	
	
	if ((pg = source.indexOf(', p. '))>=0) {
		result.pages = source.slice(pg + 5);
	}
	else if ((pg = source.indexOf(', pp. '))>=0) {
		result.pages = source.slice(pg + 6);
	}
	
	if (published_by) {
		let c = published_by.length - 1;
		
		while (c >= 0 && published_by[c] < 'A') {
			c--;
		}
		
		result.publisher = published_by.slice(0, c);
		
		if (m = /([0-9]{4})\)/.exec(published_by)) {
			result.year = m[1];
		}
	}
	
	if(result.title) {
		result.title = result.title.trim();
		result.title = result.title.replace(/\n/g, ' ');
	}
	
	return result;
};
