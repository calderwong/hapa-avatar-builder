import test from 'node:test';
import assert from 'node:assert/strict';
import {campfireShaderCards,paintCampfireShaderOverlay} from '../src/domain/echo-campfire-layers.js';

test('Campfire blends persistent shader slots without admitting scheduled cut pictures',()=>{
 const cards=[{id:'picture'},{id:'always',alwaysOn:true},{id:'slot',persistentSlotId:'persistent-1'},{id:'ordinary',alwaysOn:false}];
 assert.deepEqual(campfireShaderCards(cards).map(c=>c.id),['always','slot']);
 assert.deepEqual(campfireShaderCards([]),[]);
});
test('recording uses a bounded light blend and restores the lyrics drawing state',()=>{
 const draws=[],stack=[];
 const ctx={globalAlpha:.9,globalCompositeOperation:'source-over',save(){stack.push([this.globalAlpha,this.globalCompositeOperation]);},restore(){[this.globalAlpha,this.globalCompositeOperation]=stack.pop();},drawImage(...args){draws.push([this.globalAlpha,this.globalCompositeOperation,...args]);}};
 const canvas={width:1080,height:1920};
 assert.equal(paintCampfireShaderOverlay(ctx,canvas,540,960,.65),true);
 assert.deepEqual(draws[0],[.65,'screen',canvas,0,0,540,960]);
 assert.equal(ctx.globalAlpha,.9);assert.equal(ctx.globalCompositeOperation,'source-over');
 paintCampfireShaderOverlay(ctx,canvas,540,960,2);assert.equal(draws[1][0],1);
 for(const strength of [0,-1,NaN])assert.equal(paintCampfireShaderOverlay(ctx,canvas,540,960,strength),false);
 assert.equal(paintCampfireShaderOverlay(ctx,{width:0,height:0},540,960),false);
});

test('background forest stays outside the camera orbit throughout the fire and dust height',async()=>{
 const {readFile}=await import('node:fs/promises');
 const scene=await readFile(new URL('../vendor/campfire-stage/src/shaders/scene.js',import.meta.url),'utf8');
 const ring=scene.match(/let d = select\(([\d.]+) \+ 3\.0 \* h\.y, ([\d.]+) \+ 5\.0 \* h\.y/);
 assert.ok(ring,'forest placement must have an explicit measurable envelope');
 const nearestBase=Math.min(Number(ring[1]),Number(ring[2]));
 // Worst case: cluster mate toward the fire, maximum lean through 4.2 m
 // subject height, and maximum flared trunk radius. Original 4 m ring fails.
 const nearestSurface=nearestBase-1.05-.105*4.2-.26*1.45;
 assert.ok(nearestSurface>6.2,`forest intrudes into stage camera envelope: ${nearestSurface}`);
});
