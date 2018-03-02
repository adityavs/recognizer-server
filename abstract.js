const XRegExp = require('xregexp');
const Abstract = function () {

};

module.exports = Abstract;

Abstract.prototype.extract = function (doc) {
	for (let page of doc.pages) {
		let res;
		res = this.extractStructured(page);
		if (res) return res;
		
		res = this.extractSimple(page);
		if (res) return res;
	}
	return null;
};

Abstract.prototype.isDotLast = function (text) {
	text = text.trim();
	return text[text.length - 1] === '.';
};

Abstract.prototype.extractSimple = function (page) {
	let abstract = '';
	let found_abstract = 0;
	
	let start = 0;
	let start_skip = 0;
	let finish = 0;
	
	let error = 0;
	
	let abstract_x_min = 0;
	let abstract_x_max = 0;
	
	let txt_x_min = 0;
	let txt_x_max = 0;
	
	for (let flow_i = 0; flow_i < page.flows.length; flow_i++) {
		let flow = page.flows[flow_i];
		
		for (let block_i = 0; block_i < flow.blocks.length; block_i++) {
			let block = flow.blocks[block_i];
			
			for (let line_i = 0; line_i < block.lines.length; line_i++) {
				let line = block.lines[line_i];
				
				if (!found_abstract) {
					let word = line.words[0].text.toLowerCase();
					word = word.replace(/[^A-Za-z]$/, '');
					if (['abstract', 'summary'].includes(word)) {
						found_abstract = 1;
						start = 1;
						start_skip = line.words[0].text.length;
						abstract_x_min = line.words[0].xMin;
						abstract_x_max = line.words[0].xMax;
					}
				}
				
				if (start) {
					for (let word_i = 0; word_i < line.words.length; word_i++) {
						let word = line.words[word_i];
						
						for (let c of word.text) {
							
							if (start_skip) {
								start_skip--;
							}
							else {
								
								if (!finish && XRegExp('[\\p{Letter}0-9]').test(c)) {
									finish = 1;
								}
								
								if (finish) {
									
									if (!txt_x_min || txt_x_min > word.xMin) {
										txt_x_min = word.xMin;
									}
									
									if (!txt_x_max || txt_x_max < word.xMax) {
										txt_x_max = word.xMax;
									}
//                                    if(abstract_x_max && word->x_min > abstract_x_max) {
//                                        return 0;
//                                    }
									
									
									abstract += c;
								}
							}
						}
						
						if (word.space) {
							if (start_skip) {
								start_skip--;
							}
							else {
								if (finish) {
									if (word.space) {
										abstract += ' ';
									}
								}
							}
						}
					}
				}
				
				if (finish) {
					if (abstract.length && abstract[abstract.length - 1] === '-') {
						abstract = abstract.slice(0, abstract.length - 1);
					}
					else {
						abstract += ' ';
					}
				}
				
				if (finish) {
					//console.log("line:", line.xMax);
					if (this.isDotLast(abstract) &&
						line_i >= 2 &&
						Math.abs(block.lines[line_i - 2].xMax - block.lines[line_i - 1].xMax) < 1.0 &&
						block.lines[line_i].xMax < block.lines[line_i - 1].xMax - 2) {
						//console.log("\n\n\n", abstract);
						
						if (abstract_x_max > txt_x_max || abstract_x_max < txt_x_min) {
							return null;
						}
						return abstract.trim();
					}
				}
			}
			
			if (finish) {
//                log_debug("%s\n\n\n", abstract);
				if (!this.isDotLast(abstract)) continue;
				
				if (abstract_x_max > txt_x_max || abstract_x_max < txt_x_min) {
					return null;
				}
				return abstract.trim();
			}
		}
		
		if (finish) {
			//console.log("\n\n\n", abstract);
			
			if (abstract_x_max > txt_x_max || abstract_x_max < txt_x_min) {
				return null;
			}
			return abstract.trim();
		}
	}
	
	return abstract.trim();
};

Abstract.prototype.is_structured_abstract_name = function (word) {
	let names = {
		"background": 1,
		"methods": 2,
		"method": 2,
		"conclusions": 3,
		"conclusion": 3,
		"objectives": 4,
		"objective": 4,
		"results": 5,
		"result": 5,
		"purpose": 6,
		"measurements": 7
	};
	
	let word2 = word.toLowerCase();
	word2 = word2.replace(/[^A-Za-z]$/, '');
	
	for (let name in names) {
		if (word2 === name && word[0].toUpperCase() === word[0]) {
			return names[name];
		}
	}
	
	return 0;
};

Abstract.prototype.extractStructured = function (page) {
	let abstract = '';
	
	let start = 0;
	let abstract_len = 0;
	let exit = 0;
	let error = 0;
	
	let names_detected = 0;
	
	let x_min = 0;
	let font_size = 0;
	
	let last_name_type = 0;
	
	for (let flow_i = 0; flow_i < page.flows.length; flow_i++) {
		let flow = page.flows[flow_i];
		
		for (let block_i = 0; block_i < flow.blocks.length; block_i++) {
			let block = flow.blocks[block_i];
			
			for (let line_i = 0; line_i < block.lines.length; line_i++) {
				let line = block.lines[line_i];
				
				if (/^(Keyword|KEYWORD|Key Word|Indexing Terms)/.test(line.text)) {
					return abstract.trim();
				}
				
				let type = this.is_structured_abstract_name(line.words[0].text);
				if (type) {
					last_name_type = type;
					names_detected++;
					start = 1;
					exit = 0;
					if (abstract.length) abstract += '\n';
					
					if (x_min) {
						if (Math.abs(x_min - line.words[0].xMin) > 2) {
							return null;
						}
					}
					else {
						x_min = line.words[0].xMin;
					}
					
					if (font_size) {
						if (Math.abs(font_size - line.words[0].fontsize) > 1) {
							return null;
						}
					}
					else {
						font_size = line.words[0].fontsize;
					}
				}
				
				if (start) {
					if (exit) {
						//console.log("\n\n\n", abstract);
						return null;
					}
				}
				
				if (start) {
					abstract += line.text + ' ';
				}
			}
			
		}
		
		if (start) {
			if (names_detected >= 2 && last_name_type === 3) {
				//console.log("\n\n\n", abstract);
				return abstract.trim();
			}
			else {
				return null;
			}
		}
		
	}
	
	return null;
};
