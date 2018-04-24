const XRegExp = require('xregexp');
const utils = require('./utils');

const Abstract = function () {

};

module.exports = Abstract;

Abstract.prototype.extract = function (doc) {
	let res;
	let i = 0;
	for (; i < doc.pages.length; i++) {
		let page = doc.pages[i];
		res = this.extractStructured(page);
		if (res) break;
		res = this.extractSimple(page);
		if (res) break;
		res = this.extractBeforeKeywords(page);
		if (res) break;
	}
	
	if (res) {
		return {
			pageIndex: i,
			pageY: res.yMin,
			text: res.text
		};
	}
	
	return null;
};

Abstract.prototype.extractBeforeKeywords = function (page) {
	for (let i = 1; i < page.lbs.length; i++) {
		let lb = page.lbs[i];
		if (/(keywords|key words|indexing terms)([: a-z]*),([ a-z]*)/.test(lb.lines[0].text.toLowerCase()) &&
			lb.lines[0].text[0] === lb.lines[0].text[0].toUpperCase()) {
			let lbPrev = page.lbs[i - 1];
			let abstract = '';
			for (let line of lbPrev.lines) {
				abstract += line.text;
				if (abstract.length && /[-\u2010]/.test(abstract[abstract.length - 1])) {
					abstract = abstract.slice(0, abstract.length - 1);
				}
				else {
					if (!XRegExp('[\\p{Dash_Punctuation}]').test(abstract[abstract.length - 1])) {
						abstract += ' ';
					}
				}
			}
			abstract = abstract.trim();
			if (
				abstract.length &&
				abstract[0] === abstract[0].toUpperCase() &&
				abstract[abstract.length - 1] === '.' &&
				abstract.length > 200 && abstract.length < 3000
			) {
				return {yMin: lbPrev.lines[0].yMin, text: abstract};
			}
		}
	}
	return null;
};

Abstract.prototype.extractSimple = function (page) {
	
	function getAbstractLines(lines, line_i) {
		let abstractLines = [];
		let start_i = line_i;
		for (; line_i < lines.length; line_i++) {
			let line = lines[line_i];
			
			if (/^(Keyword|KEYWORD|Key Word|Indexing Terms)/.test(line.text)) break;
			
			if (utils.isBreakSection(line.text)) break;
			
			abstractLines.push(lines[line_i]);
			
			if (line_i >= 2) {
				let prevDiff = Math.abs(lines[line_i - 2].xMax - lines[line_i - 1].xMax);
				let curDiff = lines[line_i - 1].xMax - lines[line_i].xMax;
				
				if (/[\)\.]/.test(lines[line_i].text.slice(-1)) &&
					line_i - start_i >= 2 &&
					prevDiff < 1.0 &&
					curDiff > 2.0
				) {
					break;
				}
			}
			
			if (line_i + 1 === lines.length) break;
			
			if (line_i >= 1 && line_i - start_i >= 1) {
				let prevGap = lines[line_i].yMin - lines[line_i - 1].yMax;
				let nextGap = lines[line_i + 1].yMin - lines[line_i].yMax;
				if (nextGap - prevGap > 5.0) {
					break;
				}
			}
		}
		return abstractLines;
	}
	
	function joinAbstractLines(lines) {
		let text = '';
		for (let i = 0; i < lines.length; i++) {
			let line = lines[i];
			if (i > 0) {
				if (/[-\u2010]/.test(text.slice(-1))) {
					text = text.slice(0, -1);
				}
				else if (!XRegExp('[\\p{Dash_Punctuation}]').test(text.slice(-1))) {
					text += ' ';
				}
			}
			text += line.text;
		}
		return text;
	}
	
	function indexOfFirstAlphaNum(text) {
		for (let i = 0; i < text.length; i++) {
			let c = text[i];
			if (XRegExp('[\\p{Letter}0-9]').test(c)) {
				return i;
			}
		}
		return -1;
	}
	
	function getTitle(line) {
		let titles = ['abstract', 'summary'];
		let text = line.text.toLowerCase();
		for (let i = 0; i < titles.length; i++) {
			if (text.indexOf(titles[i]) === 0) {
				return text.slice(0, titles[i].length);
			}
		}
		return null;
	}
	
	function pageToLines(page) {
		let lines = [];
		for (let flow of page.flows) {
			for (let block of flow.blocks) {
				for (let line of block.lines) {
					lines.push(line);
				}
			}
		}
		return lines;
	}
	
	let lines = pageToLines(page);
	
	for (let line_i = 1; line_i < lines.length; line_i++) {
		let line = lines[line_i];
		
		if (line_i === lines.length - 1) break;
		
		// let word_x_max = line.words[0].xMax;
		// let next_line_x_max = lines[line_i + 1].xMax;
		// let next_line_x_min = lines[line_i + 1].xMin;
		//if (Math.abs(line.words[0].yMin-lines[line_i + 1].yMin)>2.0 &&( word_x_max > next_line_x_max || word_x_max < next_line_x_min)) continue;
		
		let title = getTitle(line);
		if (title) {
			let abstractLines = getAbstractLines(lines, line_i);
			let text = joinAbstractLines(abstractLines);
			text = text.slice(title.length);
			let j = indexOfFirstAlphaNum(text);
			text = text.slice(j);
			if (!text.length) break;
			if (text[0] !== text[0].toUpperCase()) break;
			if(text.slice(-1)!=='.') break;
			return {yMin: line.yMin, text};
		}
	}
	return null;
};

Abstract.prototype.extractStructured = function (page) {
	
	function getTitle(text) {
		let names = {
			'background': 1,
			'methodology': 2,
			'methods': 2,
			'method': 2,
			'conclusions': 3,
			'conclusion': 3,
			'objectives': 4,
			'objective': 4,
			'results': 5,
			'result': 5,
			'purpose': 6,
			'measurements': 7,
			'comparison': 8,
			'introduction': 9
		};
		
		let text2 = text.toLowerCase();
		
		for (let name in names) {
			if (text2.indexOf(name) === 0 && text[0].toUpperCase() === text[0]) {
				return names[name];
			}
		}
		return 0;
	}
	
	function getSections(lines, line_i) {
		let sectionLines = [];
		
		let anchorWord = lines[line_i].words[0];
		
		let foundTypes = [];
		
		for (; line_i < lines.length; line_i++) {
			let line = lines[line_i];
			
			if (
				Math.abs(anchorWord.xMin - line.words[0].xMin) > 2.0 ||
				Math.abs(anchorWord.fontsize - line.words[0].fontsize) > 1.0 ||
				anchorWord.font !== line.words[0].font
			) continue;
			
			let type = getTitle(line.text);
			
			if (utils.isBreakSection(line.text)) break;
			
			if (foundTypes.includes(type)) continue;
			
			if (type) {
				foundTypes.push(type);
				sectionLines.push(line_i);
			}
			
			if (type === 3) break;
		}
		
		if (foundTypes.length < 3 || foundTypes[foundTypes.length - 1] !== 3) return null;
		return sectionLines;
	}
	
	function getLastSectionBreak(lines, line_i) {
		let start_i = line_i;
		line_i++;
		for (; line_i < lines.length; line_i++) {
			let line = lines[line_i];
			
			if (lines[line_i].xMin - lines[line_i - 1].xMax > lines[line_i - 1].words[0].fontsize * 2) break;
			
			if (/^(Keyword|KEYWORD|Key Word|Key word|Indexing Terms)/.test(lines[line_i].text)) break;
			
			if (line_i - start_i >= 2) {
				let prevGap = lines[line_i - 1].yMin - lines[line_i - 2].yMax;
				let curGap = lines[line_i].yMin - lines[line_i - 1].yMax;
				if (curGap - prevGap > 5.0) {
					break;
				}
				
				let prevDiff = Math.abs(lines[line_i - 3].xMax - lines[line_i - 2].xMax);
				let curDiff = lines[line_i - 2].xMax - lines[line_i-1].xMax;
				
				if (/[\)\.]/.test(lines[line_i-1].text.slice(-1)) &&
					prevDiff < 1.0 &&
					curDiff > 2.0
				) {
					break;
				}
			}
		}
		return line_i - 1;
	}
	
	function sectionsToText(sections) {
		let text = '';
		
		for (let i = 0; i < sections.length; i++) {
			let section = sections[i];
			
			if (i > 0) text += '\n';
			
			for (let j = 0; j < section.lines.length; j++) {
				let line = section.lines[j];
				if (j > 0) {
					if (/[-\u2010]/.test(text.slice(-1))) {
						text = text.slice(0, -1);
					}
					else if (!XRegExp('[\\p{Dash_Punctuation}]').test(text.slice(-1))) {
						text += ' ';
					}
				}
				text += line.text;
			}
		}
		return text;
	}
	
	function pageToLines(page) {
		let lines = [];
		for (let flow of page.flows) {
			for (let block of flow.blocks) {
				for (let line of block.lines) {
					lines.push(line);
				}
			}
		}
		return lines;
	}
	
	let lines = pageToLines(page);
	
	for (let line_i = 0; line_i < lines.length; line_i++) {
		let line = lines[line_i];
		let lns = getSections(lines, line_i);
		if (lns && lns.length) {
			let sections = [];
			for (let i = 0; i < lns.length; i++) {
				
				if (i + 1 < lns.length) {
					sections.push({
						lines: lines.slice(lns[i], lns[i + 1])
					});
				}
				else {
					let j = getLastSectionBreak(lines, lns[i]);
					sections.push({
						lines: lines.slice(lns[i], j+1)
					});
				}
			}
			return {yMin: line.yMin, text: sectionsToText(sections)};
		}
	}
	
	return null;
};
