"use strict";

//Text texture constructor
function TextTexture()
{
	//Text canvas
	this.canvas = document.createElement("canvas");
	this.canvas.width = 512;
	this.canvas.height = 512;

	//Draw text to canvas
	this.context = this.canvas.getContext("2d");
	this.context.font = "Normal 60px Arial";
	this.context.textAlign = "center";
	this.context.fillStyle = "#FFFFFF";
	this.context.fillText("text", this.canvas.width/2, this.canvas.height/2);

	//Super constructor
	THREE.CanvasTexture.call(this, this.canvas);

	//Name
	this.name = "text";
	this.category = "TextTexture";

	//Texture text
	this.text = "text";
}

//Super prototypes
TextTexture.prototype = Object.create(THREE.CanvasTexture.prototype);