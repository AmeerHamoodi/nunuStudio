"use strict";

/**
 * Screen space ambient occlusion (SSAO) pass is used to simulate ambient occlusion shadowing effect.
 *
 * More information about SSAO here
 *  - http://developer.download.nvidia.com/SDK/10.5/direct3d/Source/ScreenSpaceAO/doc/ScreenSpaceAO.pdf
 *
 * @author alteredq / http://alteredqualia.com/
 * @author tentone
 * @class SSAOPass
 * @module Postprocessing
 */
function SSAOPass()
{
	if(THREE.SSAOShader === undefined)
	{
		console.warn("SSAOPass depends on THREE.SSAOShader");
	}

	Pass.call(this, THREE.SSAOShader);

	this.type = "SSAO";
	this.renderToScreen = false;

	this.kernelRadius = 8;
	this.kernelSize = 64;
	this.kernel = [];
	this.noiseTexture = null;
	this.output = 0;
	this.minDistance = 0.005;
	this.maxDistance = 0.1;

	this.generateSampleKernel();
	this.generateRandomKernelRotations();

	//TODO <THIS HAS COME FROM THE BOEKN PASS>
	/*
	//Depth material
	this.materialDepth = new THREE.MeshDepthMaterial();
	this.materialDepth.depthPacking = THREE.RGBADepthPacking;
	this.materialDepth.blending = THREE.NoBlending;
	*/

	var depthTexture = new THREE.DepthTexture();
	depthTexture.type = THREE.UnsignedShortType;
	depthTexture.minFilter = THREE.NearestFilter;
	depthTexture.maxFilter = THREE.NearestFilter;

	/*
	this.beautyRenderTarget = new THREE.WebGLRenderTarget(1, 1,
	{
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat,
		depthTexture: depthTexture,
		depthBuffer: true
	});
	*/

	//Normal render target
	this.normalRenderTarget = new THREE.WebGLRenderTarget(1, 1,
	{
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBAFormat,
		depthTexture: depthTexture,
		depthBuffer: true
	});

	//SSAO render target
	this.ssaoRenderTarget = new THREE.WebGLRenderTarget(1, 1, Pass.RGBALinear);

	//Blur render target
	this.blurRenderTarget = new THREE.WebGLRenderTarget(1, 1, Pass.RGBALinear);

	//Normal material
	this.normalMaterial = new THREE.MeshNormalMaterial();
	this.normalMaterial.blending = THREE.NoBlending;

	//Blur material
	this.blurMaterial = new THREE.ShaderMaterial(
	{
		defines: Object.assign({}, THREE.SSAOBlurShader.defines),
		uniforms: THREE.UniformsUtils.clone(THREE.SSAOBlurShader.uniforms),
		vertexShader: THREE.SSAOBlurShader.vertexShader,
		fragmentShader: THREE.SSAOBlurShader.fragmentShader
	});
	this.blurMaterial.uniforms["tDiffuse"].value = this.ssaoRenderTarget.texture;
	
	//Material for rendering the depth
	this.depthRenderMaterial = new THREE.ShaderMaterial(
	{
		defines: Object.assign({}, THREE.SSAODepthShader.defines),
		uniforms: THREE.UniformsUtils.clone(THREE.SSAODepthShader.uniforms),
		vertexShader: THREE.SSAODepthShader.vertexShader,
		fragmentShader: THREE.SSAODepthShader.fragmentShader,
		blending: THREE.NoBlending
	});

	//Material for rendering the content of a render target
	this.copyMaterial = new THREE.ShaderMaterial(
	{
		uniforms: THREE.UniformsUtils.clone(THREE.CopyShader.uniforms),
		vertexShader: THREE.CopyShader.vertexShader,
		fragmentShader: THREE.CopyShader.fragmentShader,
		transparent: true,
		depthTest: false,
		depthWrite: false,
		blendSrc: THREE.DstColorFactor,
		blendDst: THREE.ZeroFactor,
		blendEquation: THREE.AddEquation,
		blendSrcAlpha: THREE.DstAlphaFactor,
		blendDstAlpha: THREE.ZeroFactor,
		blendEquationAlpha: THREE.AddEquation
	});

	//Quad scene
	this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	this.quadScene = new THREE.Scene();
	this.quad = new THREE.Mesh(new THREE.PlaneBufferGeometry(2, 2), null);
	this.quadScene.add(this.quad);

	//Original clean color
	this.originalClearColor = new THREE.Color();

	//SSAO Shader material
	this.ssaoMaterial = new THREE.ShaderMaterial(
	{
		defines: Object.assign({}, THREE.SSAOShader.defines),
		uniforms: THREE.UniformsUtils.clone(THREE.SSAOShader.uniforms),
		vertexShader: THREE.SSAOShader.vertexShader,
		fragmentShader: THREE.SSAOShader.fragmentShader,
		blending: THREE.NoBlending
	});
	this.ssaoMaterial.uniforms["tNormal"].value = this.normalRenderTarget.texture;
	this.ssaoMaterial.uniforms["tNoise"].value = this.noiseTexture;
	this.ssaoMaterial.uniforms["kernel"].value = this.kernel;
}

SSAOPass.prototype = Object.create(Pass.prototype);

/** 
 * Generate a sample kernel based on the kernelSize value.
 * 
 * @method generateSampleKernel
 */
SSAOPass.prototype.generateSampleKernel = function()
{
	for(var i = 0; i < this.kernelSize; i ++)
	{
		var sample = new THREE.Vector3();
		sample.x = (Math.random() * 2) - 1;
		sample.y = (Math.random() * 2) - 1;
		sample.z = Math.random();
		sample.normalize();

		var scale = i / this.kernelSize;
		scale = THREE.Math.lerp(0.1, 1, scale * scale);
		sample.multiplyScalar(scale);
		this.kernel.push(sample);
	}
};

/**
 * Use noise to generate multiple pseudo random kernel rotations.
 *
 * @method generateRandomKernelRotations
 */
SSAOPass.prototype.generateRandomKernelRotations = function()
{
	var width = 4, height = 4;

	if(SimplexNoise === undefined)
	{
		console.error("SSAOPass: The pass relies on THREE.SimplexNoise.");
	}

	var simplex = new SimplexNoise();
	var size = width * height;
	var data = new Float32Array(size);

	for(var i = 0; i < size; i++)
	{
		var x = (Math.random() * 2) - 1;
		var y = (Math.random() * 2) - 1;
		var z = 0;
		data[i] = simplex.noise3d(x, y, z);
	}

	this.noiseTexture = new THREE.DataTexture(data, width, height, THREE.LuminanceFormat, THREE.FloatType);
	this.noiseTexture.wrapS = THREE.RepeatWrapping;
	this.noiseTexture.wrapT = THREE.RepeatWrapping;
	this.noiseTexture.needsUpdate = true;
};

/**
 * Render using this pass.
 * 
 * @method render
 * @param {WebGLRenderer} renderer
 * @param {WebGLRenderTarget} writeBuffer Buffer to write output.
 * @param {WebGLRenderTarget} readBuffer Input buffer.
 * @param {Number} delta Delta time in milliseconds.
 * @param {Boolean} maskActive Not used in this pass.
 */
SSAOPass.prototype.render = function(renderer, writeBuffer, readBuffer, delta, maskActive, scene, camera)
{
	//Update camera uniforms
	this.depthRenderMaterial.uniforms["cameraNear"].value = camera.near;
	this.depthRenderMaterial.uniforms["cameraFar"].value = camera.far;
	
	//Render normals (and depth)
	this.renderOverride(renderer, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0, scene, camera);
	
	//Input buffer
	this.ssaoMaterial.uniforms["tDiffuse"].value = readBuffer.texture;
	this.depthRenderMaterial.uniforms["tDepth"].value = this.normalRenderTarget.depthTexture;
	this.ssaoMaterial.uniforms["tDepth"].value = this.normalRenderTarget.depthTexture;

	//Render beauty and depth
	//renderer.render(scene, camera, this.beautyRenderTarget, true);

	//Render SSAO
	this.ssaoMaterial.uniforms["cameraNear"].value = camera.near;
	this.ssaoMaterial.uniforms["cameraFar"].value = camera.far;
	this.ssaoMaterial.uniforms["cameraProjectionMatrix"].value.copy(camera.projectionMatrix);
	this.ssaoMaterial.uniforms["cameraInverseProjectionMatrix"].value.getInverse(camera.projectionMatrix); 
	this.ssaoMaterial.uniforms["kernelRadius"].value = this.kernelRadius;
	this.ssaoMaterial.uniforms["minDistance"].value = this.minDistance;
	this.ssaoMaterial.uniforms["maxDistance"].value = this.maxDistance;
	this.renderPass(renderer, this.ssaoMaterial, this.ssaoRenderTarget);

	//Render blur
	this.renderPass(renderer, this.blurMaterial, this.blurRenderTarget);

	//Copy SSAO result
	//this.copyMaterial.uniforms["tDiffuse"].value = readBuffer.texture;
	//this.copyMaterial.blending = THREE.NoBlending;
	//this.renderPass(renderer, this.copyMaterial, null);

	//Copy blur and blend it to output
	this.copyMaterial.uniforms["tDiffuse"].value = this.normalRenderTarget.texture;
	this.copyMaterial.blending = THREE.CustomBlending;

	if(this.renderToScreen)
	{
		this.renderPass(renderer, this.copyMaterial, undefined, this.clear);
	}
	else
	{
		this.renderPass(renderer, this.copyMaterial, writeBuffer, this.clear);
	}
};

/**
 * Render a quad scene using a pass material.
 *
 * @method renderPass
 */
SSAOPass.prototype.renderPass = function(renderer, passMaterial, renderTarget, clear)
{
	this.quad.material = passMaterial;
	renderer.render(this.quadScene, this.quadCamera, renderTarget, clear);
};

/**
 * Render scene using a override material.
 *
 * @method renderOverride
 */
SSAOPass.prototype.renderOverride = function (renderer, overrideMaterial, renderTarget, clearColor, clearAlpha, scene, camera)
{
	//Backup renderer state
	this.originalClearColor.copy(renderer.getClearColor());
	var originalClearAlpha = renderer.getClearAlpha();
	var originalAutoClear = renderer.autoClear;

	clearColor = overrideMaterial.clearColor || clearColor;
	clearAlpha = overrideMaterial.clearAlpha || clearAlpha;

	renderer.autoClear = false;
	renderer.setClearColor(clearColor);
	renderer.setClearAlpha(clearAlpha);
	scene.overrideMaterial = overrideMaterial;
	renderer.render(scene, camera, renderTarget, true);
	scene.overrideMaterial = null;

	//Restore original state
	renderer.autoClear = originalAutoClear;
	renderer.setClearColor(this.originalClearColor);
	renderer.setClearAlpha(originalClearAlpha);
};

/**
 * Set resolution of this render pass.
 * 
 * @method setSize
 * @param {Number} width
 * @param {Number} height
 */
SSAOPass.prototype.setSize = function(width, height)
{
	this.ssaoMaterial.uniforms["resolution"].value.set(width, height);
	this.blurMaterial.uniforms["resolution"].value.set(width, height);

	//this.beautyRenderTarget.setSize(width, height);
	this.normalRenderTarget.setSize(width, height);
	this.ssaoRenderTarget.setSize(width, height);
	this.blurRenderTarget.setSize(width, height);
};

/**
 * Serialize pass to json.
 *
 * @method toJSON
 * @param {Object} meta Metadata object.
 */
SSAOPass.prototype.toJSON = function(meta)
{
	var data = Pass.prototype.toJSON.call(this, meta);
		
	//TODO <NEW SERIALIZATION CODE>

	/*
	data.onlyAO = this.onlyAO;
	data.radius = this.radius;
	data.aoClamp = this.aoClamp;
	data.lumInfluence = this.lumInfluence;
	*/

	return data;
};