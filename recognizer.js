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
	// Process the received json to doc
	let doc = this.doc.getDoc(json);
	if (!doc || !doc.pages.length) throw new Error('Invalid doc');
	
	let res;
	
	// Init default parameters
	let result = {type: 'journal-article', authors: []};
	
	if (res = await this.page.detectLanguage(doc)) result.language = res;
	
	// For JSTOR PDF, parse metadata in the first page and extract abstract
	if (res = this.jstor.extract(doc.pages[0])) {
		result = Object.assign(result, res);
		if (res = this.abstract.extract(doc)) result.abstract = res.text;
		return result;
	}
	
	// Extract PDF file metadata
	res = await this.metadata.extract(doc);
	result = Object.assign(result, res);
	
	if (res = this.extract.isbn(doc.text)) result.isbn = res;
	if (res = this.extract.arxiv(doc.pages[0].text)) result.arxiv = res;
	if (res = this.extract.issn(doc.text)) result.issn = res;
	
	// Extract journal name, volume, year and issue from header and footer
	let headerFooterText = this.page.extractHeaderFooter(doc);
	if (res = await this.extract.journal(headerFooterText)) result.container = res;
	if (res = this.extract.volume(headerFooterText)) result.volume = res;
	if (res = this.extract.year(headerFooterText)) result.year = res;
	if (res = this.extract.issue(headerFooterText)) result.issue = res;
	
	if (res = this.extract.keywords(doc)) result.keywords = res;
	
	result.pages = doc.totalPages.toString();
	
	// Title extraction proceeds until the break line
	let breakLine = null;
	
	// Extract abstract, and get pageIndex and pageY that are used for break line
	if (res = this.abstract.extract(doc)) {
		result.abstract = res.text;
		// Abstract position becomes a break line, because title is always above abstract
		breakLine = {
			pageIndex: res.pageIndex,
			pageY: res.pageY
		};
	}
	
	// Try to find another break line
	if (res = this.page.getTitleBreakLine(doc)) {
		if (!breakLine) {
			breakLine = res;
		}
		// If already exists, compare which one is closer to the top
		else if (
			breakLine.pageIndex > res.pageIndex ||
			breakLine.pageIndex === res.pageIndex && breakLine.pageY > res.pageY
		) {
			breakLine = res;
		}
	}
	
	// If title was found in PDF metadata, but authors aren't,
	// try to locate that title and extract authors in the line before or after
	if (result.title && !result.authors.length) {
		if (res = await this.title.getAuthorsNearExistingTitle(doc, result.title)) result.authors = res;
	}
	
	// If we still don't have a title, and the document language is supported
	if (!result.title && this.isLanguageAllowed(result.language)) {
		res = null;
		
		// Get article first page (skip injected pages)
		let firstPage = this.page.getFirstPage(doc);
		
		// Try to extract title and authors from the first article page (skip injected pages),
		// but take into account the break line
		let pageIndex = firstPage;
		if (!breakLine || pageIndex <= breakLine.pageIndex) {
			let y = null;
			if (breakLine && pageIndex === breakLine.pageIndex) y = breakLine.pageY;
			if (res = await this.title.getTitleAndAuthors(doc.pages[pageIndex], y)) {
				result.title = res.title;
				result.authors = res.authors;
			}
		}
		
		// Try to extract title and authors from the second page,
		// but take into account the break line
		if (!res && firstPage === 0 && doc.pages.length >= 2) {
			pageIndex = 1;
			if (!breakLine || pageIndex <= breakLine.pageIndex) {
				let y = null;
				if (breakLine && pageIndex === breakLine.pageIndex) y = breakLine.pageY;
				if (res = await this.title.getTitleAndAuthors(doc.pages[pageIndex], y)) {
					result.title = res.title;
					result.authors = res.authors;
				}
			}
		}
	}
	
	// Resolving DOI by title can be more precise, because DOI regexing
	// from text can return DOIs that belong to other articles
	if (!result.doi) {
		if (res = await this.title.findDoiByTitle(doc, breakLine)) result.doi = res;
	}
	
	// Regex DOI
	if (!result.doi) {
		if (res = await this.extract.doi(doc)) result.doi = res;
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
