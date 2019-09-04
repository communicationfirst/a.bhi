// Inspired by http://lisperator.net/pltut/
/*

BASE = NUM | STR | VAR | CALL | IF | FOR | WHILE | FN | SET | LIST
ATOM = BASE [+-] BASE
EXPR = ATOM [*%/] ATOM 
NUM = [0123456789.]...
STR = ['"]*...['"]
VAR = [a-zA-Z_?]...
LIST = (EXPR) | (EXPR, EXPR ...)
CALL = call VAR LIST
IF = if EXPR LIST else LIST
FOR = for EXPR ; EXPR ; EXPR LIST
WHILE = while EXPR LIST
FN = fn VAR LIST LIST
SET = set VAR = EXPR

*/

var EOF = -1;

function AbhiScriptInterpreterException(message) {
	this.name = 'AbhiScriptInterpreterException';
	this.message = message;
}

function AbhiScriptTokenizer(source) {
	this.source = source;
	this.pos = 0;

	this.end = function() {
		return this.pos < 0 || this.pos >= this.source.length;
	}

	this.current = function() {
		if(this.end()) { return EOF; }
		return this.source[this.pos];
	}

	this.advance = function() {
		this.pos += 1;
	}

	this.advance_while = function(condition) {
		var lexeme = '';
		while(!this.end() && condition(this.current())) {
			lexeme += this.current();
			this.advance();
		}
		return lexeme;
	}

	this.tokenize = function() {
		var tokens = [];
		while(!this.end()) {
			if(!isNaN(parseInt(this.current())) || this.current() === '.') {
				tokens.push({'type':'NUM', 'lexeme':this.advance_while(function(c) { return !isNaN(parseInt(c)) || c === '.'; })});
				this.pos -= 1;
			}
			else if(this.current() === '\'' || this.current() === '\"' || this.current() === '\`') {
				var end = this.current();
				this.advance();
				tokens.push({'type':'STR', 'lexeme':this.advance_while(function(c) {
					return c !== end;
				})});
			}
			else if(this.current().toUpperCase() !== this.current().toLowerCase() || this.current() === '_' || this.current() === '?') {
				var _this = this;
				tokens.push({'type':'VAR', 'lexeme':this.advance_while(function(c) {
					return _this.current().toUpperCase() !== _this.current().toLowerCase() || _this.current() === '_' || _this.current() === '?';
				})});
				this.pos -= 1;
			}
			else if('();,='.indexOf(this.current()) !== -1) { tokens.push({'type':'PNC', 'lexeme':this.current()}); }
			else if('+-*/%'.indexOf(this.current()) !== -1) { tokens.push({'type':'OPR', 'lexeme':this.current()}); }
			this.advance();
		}
		return tokens;
	}
}

/*

BASE = NUM | STR | VAR | CALL | IF | FOR | WHILE | FN | SET | LIST
ATOM = BASE [+-] BASE
EXPR = ATOM [*%/] ATOM 
NUM = [0123456789.]...
STR = ['"]*...['"]
VAR = [a-zA-Z_?]...
LIST = (EXPR) | (EXPR, EXPR ...)
CALL = call VAR LIST
IF = if EXPR LIST else LIST
FOR = for EXPR ; EXPR ; EXPR LIST
WHILE = while EXPR LIST
FN = fn VAR LIST LIST
SET = set VAR = EXPR

*/

function AbhiScriptInterpreter(source) {
	this.source = source;
	this.tokens = new AbhiScriptTokenizer(source).tokenize();
	this.pos = 0;
	this.symbolTable = {
		'js_raw':function(str) { return eval(str); }
	};

	this.end = function() {
		return this.pos < 0 || this.pos >= this.tokens.length;
	}

	this.current = function() {
		if(this.end()) { return {'type':'EOF', 'lexeme':'EOF'}; }
		return this.tokens[this.pos];
	}

	this.advance = function() {
		this.pos += 1;
	}

	this.die = function(message) {
		throw new AbhiScriptInterpreterException(message);
	}

	this.expectType = function(type) {	
		if(this.current().type === type) {
			var tok = this.current();
			this.advance();
			return tok;
		}
		this.die('expectType expected `' + type + '`, got `' + this.current().type + '` for lexeme `' + this.current().lexeme + '`.');
	}

	this.expectLexeme = function(lexeme) {	
		if(this.current().lexeme === lexeme) {
			var tok = this.current();
			this.advance();
			return tok;
		}
		this.die('expectLexeme expected `' + lexeme + '`, got `' + this.current().lexeme + '`.');
	}

	this.parseCall = function() {
		this.advance();
		var name = this.expectType('VAR').lexeme;
		var args = this.parseList();
		return this.symbolTable[name].apply(args);
	}

	this.parseIf = function() {
		this.advance();
		var cond = this.parseExpr();
		if(cond) {
			var lst = this.parseList();
			if(this.current().lexeme === 'else') {
				this.advance();
			}
			var numParens = 1;
			this.expectLexeme('(');
			while(!this.end()) {
				if     (this.current().lexeme === '(') { numParens++; this.advance(); }
				else if(this.current().lexeme === ')') { numParens--; this.advance(); }
				if(numParens === 0) { break; }
			}
			return lst[lst.length - 1];
		}
		else {
			var numParens = 1;
			this.expectLexeme('(');
			while(!this.end()) {
				if     (this.current().lexeme === '(') { numParens++; this.advance(); }
				else if(this.current().lexeme === ')') { numParens--; this.advance(); }
				if(numParens === 0) { break; }
			}
			if(this.current().lexeme === 'else') {
				this.advance();
				var lst = this.parseList();
				return lst[lst.length - 1];
			}
		}
		return 0;
	}

	this.parseFor = function() {
		this.advance();
		var start = this.parseExpr();
		this.expectLexeme(';');
		var startPos = this.pos;
		var value;
		while(this.parseExpr()) {
			this.expectLexeme(';');
			this.parseExpr();
			value = this.parseList();

			this.pos = startPos;
		}
		return value;
	}

	this.parseWhile = function() {
		this.advance();
		var startPos = this.pos;
		var value;
		while(this.parseExpr()) {
			value = this.parseList();
			this.pos = startPos;
		}
		return value;
	}

	this.parseFn = function() {
		this.advance();
		var name = this.expectType('VAR').lexeme;
		this.expectLexeme('(');
		var args = [];
		while(!this.end()) {
			if(this.current().lexeme === ')') { break; }
			args.push(this.expectType('VAR').lexeme);
			if(this.current().lexeme === ',') { this.advance(); }
			else { break; }
		}
		this.expectLexeme(')');
		var start = this.pos;
		this.expectLexeme('(');
		var _this = this;
		this.symbolTable[name] = function() {
			_this.pos = start;
			console.log(_this.current().lexeme);
			for(var i=0;i<args.length;i++) {
				_this.symbolTable[args[i]] = arguments[i];
			}
			return _this.parseList();
		}
		var numParens = 1;
		while(!this.end()) {
			if     (this.current().lexeme === '(') { numParens++; }
			else if(this.current().lexeme === ')') { numParens--; }
			this.advance();
			if(numParens === 0) { break; }
		}
		console.log(this.current());
	}

	this.parseSet = function() {
		this.advance();
		var name = this.expectType('VAR').lexeme;
		this.expectLexeme('=');
		this.symbolTable[name] = this.parseExpr();
	}

	this.parseList = function() {
		this.advance();
		var lst = [];
		while(!this.end()) {
			if(this.current().lexeme === ')') { break; }
			lst.push(this.parseExpr());
			if(this.current().lexeme === ',') {
				this.advance();
			}
		}
		this.expectLexeme(')');
		return lst;
	}

	this.parseBase = function() {
		if(this.current().type === 'NUM') { var value = parseFloat(this.current().lexeme); this.advance(); return value; }
		else if(this.current().type === 'STR') { var value = '\'' + this.current().lexeme + '\''; this.advance(); return value; }
		else if(this.current().type === 'VAR') {
			if(this.current().lexeme === 'call') {
				return this.parseCall();
			}
			else if(this.current().lexeme === 'if') {
				return this.parseIf();
			}
			else if(this.current().lexeme === 'for') {
				return this.parseFor();
			}
			else if(this.current().lexeme === 'while') {
				return this.parseWhile();
			}
			else if(this.current().lexeme === 'fn') {
				return this.parseFn();
			}
			else if(this.current().lexeme === 'set') {
				return this.parseSet();
			}
			else {
				var value = this.symbolTable[this.current().lexeme];
				this.advance();
				return value;
			}
		}
		else if(this.current().lexeme === '(') {
			return this.parseList();
		}	
		this.die('parseBase could not parse lexeme: ' + this.current().lexeme + '.');
	}

	this.parseAtom = function() {
		var base = this.parseBase();
		while('+-'.indexOf(this.current().lexeme) !== -1) {
			var op = this.current().lexeme;
			this.advance()
			base = eval(base + op + this.parseBase());
		}
		return base;
	}

	this.parseExpr = function() {
		var atom = this.parseAtom();
		while('*/%'.indexOf(this.current().lexeme) !== -1) {
			var op = this.current().lexeme;
			this.advance()
			atom = eval(atom + op + this.parseAtom());
		}
		return atom;
	}

	this.interpret = function() {
		var results = [];
		while(!this.end()) {
			results.push(this.parseExpr());
		}
		return this.symbolTable;
	}
}
