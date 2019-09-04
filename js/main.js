window.onload = function() {
	var title = document.getElementById('title');
	var content = document.getElementById('content');
	var output = document.getElementById('output');

	var keys = {
		'ctrl':false
	}

	content.addEventListener('keydown', function(ev) {
		if(ev.keyCode === 17) {
			keys.ctrl = true;
		}
		else if(ev.keyCode === 13 && keys.ctrl) {
			ev.preventDefault();
			var source = this.value;
			console.log(new AbhiScriptInterpreter(source).interpret());
		}
	});

	content.addEventListener('keyup', function(ev) {
		if(ev.keyCode === 17) {
			keys.ctrl = false;
		}
	});
}
