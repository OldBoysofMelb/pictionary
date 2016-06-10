/*
Init 
*/
	canvas = document.getElementById('myCanvas');
	ctx = canvas.getContext('2d');
	canvas.height = 400;
	canvas.width = 800;
	ctx.fillStyle = "solid";
	ctx.strokeStyle = "#000000";
	ctx.lineWidth = 5;
	ctx.lineJoin = "round";
	ctx.lineCap = "round";
	socket = io.connect('http://localhost:4000');
	socket.on('draw', function(data) {
		return draw(data.x, data.y, data.type);
	});
	draw = function(x, y, type) {
		if (type === "dragstart") {
			ctx.beginPath();
			console.log("LOLOLOLOLOL");
			ctx.moveTo(x, y);
		} else if (type === "drag") {
			console.log("isLOLOLOLOLOL");
			ctx.lineTo(x, y);
			ctx.stroke();
		} else {
			console.log("endLOLOLOLOLOL");
			ctx.closePath();
		}
	};
/*
Draw Events

$( document ).on('drag dragstart dragend', 'canvas', function(e) {
	var offset, type, x, y;
	type = e.handleObj.type;
	offset = $(this).offset();
	e.offsetX = e.layerX - offset.left;
	e.offsetY = e.layerY - offset.top;
	x = e.offsetX;
	y = e.offsetY;
	App.draw(x, y, type);
	App.socket.emit('drawClick', {
		x: x,
		y: y,
		type: type
	});
});
$(function() {
	return App.init();
});
*/
var mouse = {x: 0, y: 0};
 
canvas.addEventListener('mousemove', function(e) {
  mouse.x = e.pageX - this.offsetLeft;
  mouse.y = e.pageY - this.offsetTop;
}, false);

ctx.lineWidth = 3;
ctx.lineJoin = 'round';
ctx.lineCap = 'round';
ctx.strokeStyle = '#00CC99';
 
canvas.addEventListener('mousedown', function(e) {
    ctx.beginPath();
    ctx.moveTo(mouse.x, mouse.y);
 
    canvas.addEventListener('mousemove', onPaint, false);
}, false);
 
canvas.addEventListener('mouseup', function() {
    canvas.removeEventListener('mousemove', onPaint, false);
}, false);
 
var onPaint = function() {
    ctx.lineTo(mouse.x, mouse.y);
    ctx.stroke();
};
