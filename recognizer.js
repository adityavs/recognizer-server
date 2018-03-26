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

const utils = require('./utils');
const Doc = require('./doc');
const Authors = require('./authors');
const Title = require('./title');
const Abstract = require('./abstract');
const Extract = require('./extract');
const Metadata = require('./metadata');
const Page = require('./page');
const Jstor = require('./jstor');
const Db = require('./db');

const Recognizer = function () {
	
};

module.exports = Recognizer;

Recognizer.prototype.init = async function () {
	this.db = new Db();
	await this.db.init();
	
	this.doc = new Doc();
	this.authors = new Authors({db: this.db});
	this.title = new Title({db: this.db, authors: this.authors});
	this.extract = new Extract({db: this.db});
	this.metadata = new Metadata({db: this.db, authors: this.authors});
	this.abstract = new Abstract();
	this.page = new Page();
	this.jstor = new Jstor();
};

Recognizer.prototype.recognize = async function (json) {
	// Process received json to doc
	let doc = this.doc.getDoc(json);
	if (!doc) throw new Error('Invalid doc');
	
	let language = await this.page.detectLanguage(doc);
	
	let result = {};
	let res;
	
	res = this.jstor.extract(doc.pages[0]);
	if (res) {
		result = res;
		if (language) result.language = language;
		
		res = this.abstract.extract(doc);
		if (res) result.abstract = res.text;
		
		return result;
	}
	
	result = await this.metadata.extract(doc);
	
	if (language) result.language = language;
	
	if (!result.authors) result.authors = [];
	
	res = this.extract.isbn(doc.text);
	if (res) result.isbn = res;
	
	res = this.extract.arxiv(doc.text);
	if (res) result.arxiv = res;
	
	res = this.extract.issn(doc.text);
	if (res) result.issn = res;
	
	let text = this.page.extract_header_footer(doc);
	
	res = await this.extract.journal(text);
	if (res) result.container = res;
	
	res = this.extract.volume(text);
	if (res) result.volume = res;
	
	res = this.extract.year(text);
	if (res) result.year = res;
	
	res = this.extract.issue(text);
	if (res) result.issue = res;
	
	res = this.extract.keywords(doc);
	if (res) result.keywords = res;
	
	result.type = 'journal-article';
	
	let pageInfo = this.page.getInfo(doc);
	result.pages = pageInfo.pages;
	
	let breakLine = null;
	res = this.abstract.extract(doc);
	if (res) {
		result.abstract = res.text;
		breakLine = {
			pageIndex: res.pageIndex,
			pageY: res.pageY
		};
	}
	
	
	let bl = this.page.getTitleBreakLine(doc);
	if (bl) {
		if (!breakLine) {
			breakLine = bl;
		}
		else if (
			breakLine.pageIndex > bl.pageIndex ||
			breakLine.pageIndex === bl.pageIndex && breakLine.pageY > bl.pageY
		) {
			breakLine = bl;
		}
	}
	
	if (result.title) {
		if (!result.authors.length) {
			res = await this.title.getAuthorsByExistingTitle(doc, result.title);
			if (res) {
				result.authors = res;
			}
		}
	}
	else if (this.isLanguageAllowed(result.language)) {
		res = null;
		
		let pageIndex = pageInfo.firstPage;
		if (!breakLine || pageIndex <= breakLine.pageIndex) {
			let y = null;
			if (breakLine && pageIndex === breakLine.pageIndex) y = breakLine.pageY;
			res = await this.title.getTitleAuthor(doc.pages[pageIndex], y);
			if (res) {
				result.title = res.title;
				result.authors = res.authors;
			}
		}
		
		if (!res && pageInfo.firstPage === 0 && doc.pages.length >= 2) {
			pageIndex = 1;
			if (!breakLine || pageIndex <= breakLine.pageIndex) {
				let y = null;
				if (breakLine && pageIndex === breakLine.pageIndex) y = breakLine.pageY;
				res = await this.title.getTitleAuthor(doc.pages[pageIndex], y);
				if (res) {
					result.title = res.title;
					result.authors = res.authors;
				}
			}
		}
	}
	
	if (!result.doi) {
		let doi = await this.title.getDoi(doc, breakLine);
		if (doi) result.doi = doi;
	}
	
	if (!result.doi) {
		let doi = await this.extract.doi(doc);
		if (doi) result.doi = doi;
	}
	
	return result;
};

Recognizer.prototype.isLanguageAllowed = function (code) {
	let allowedCodes = [
		"af", "sq", "ay", "eu", "bs", "ca", "cs", "ch", "cy", "da", "de", "nl", "en",
		"et", "fo", "fj", "fi", "fr", "fy", "ga", "gl", "gv", "gn", "ht", "hr", "hu",
		"is", "id", "it", "kl", "rw", "lv", "ln", "lt", "lb", "mh", "ms", "mg", "mt",
		"na", "nr", "nd", "nn", "nb", "no", "ny", "om", "pl", "pt", "qu", "rm", "ro",
		"rn", "sg", "sk", "sl", "sm", "so", "st", "es", "ss", "sw", "sv", "tl", "to",
		"tn", "ts", "tr", "ve", "vi", "xh", "zu"
	];
	return allowedCodes.includes(code);
};
