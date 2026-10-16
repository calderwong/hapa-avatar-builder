import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {recordJourneyEditorEdit,stepJourneyEditorHistory} from '../src/domain/living-light-journey-history.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {newJourneyDraft,editableJourney,editJourneyDraft} from '../src/domain/living-light-journey.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
const registry=createLivingLightRegistry(),thing=registry.entries.find(t=>t.capabilities.destination);
const make=title=>newJourneyDraft({songId:'song:history',title,durationUs:60e6,thing,mode:'tour'},registry);
const state=(draft,identity=null,dirty=true)=>({draft,identity,selectedId:draft.instances[0].instanceId,dirty});
const identity=row=>({journeyId:row.journey.journeyId,revisionId:row.journey.revisionId,currentHead:row.currentHead,snapshot:row.journey});

test('one Undo restores the entire replaced recipe, selected use, locks and save identity; Redo restores the replacement',()=>{
 const draft=make('Original'),id=draft.instances[0].instanceId;
 const original=state(editJourneyDraft(draft,{type:'lock',instanceId:id,value:true},registry),{journeyId:'original',revisionId:'r1'});
 const replacement=state(make('Replacement'),{journeyId:'replacement',revisionId:'r9'},false);
 let history=recordJourneyEditorEdit({current:original,past:[]},replacement);
 replacement.draft.title='External mutation';original.identity.revisionId='External mutation';
 history=stepJourneyEditorHistory(history,'undo');
 assert.equal(history.current.draft.title,'Original');assert.equal(history.current.identity.journeyId,'original');assert.equal(history.current.identity.revisionId,'r1');assert.equal(history.current.selectedId,id);assert.equal(history.current.draft.instances[0].locked,true);assert.equal(history.current.dirty,true);
 history=stepJourneyEditorHistory(history,'redo');assert.equal(history.current.draft.title,'Replacement');assert.equal(history.current.identity.journeyId,'replacement');assert.equal(history.current.dirty,false);
});

test('a new edit after Undo clears the abandoned branch, and history remains bounded',()=>{
 let history=recordJourneyEditorEdit({current:null,past:[]},state(make('Initial')));assert.equal(stepJourneyEditorHistory(history,'undo'),null);
 for(let i=0;i<60;i++)history=recordJourneyEditorEdit(history,{...history.current,draft:{...history.current.draft,title:'Edit '+i}});
 assert.equal(history.past.length,50);history=stepJourneyEditorHistory(history,'undo');
 history=recordJourneyEditorEdit(history,{...history.current,draft:{...history.current.draft,title:'New branch'}});assert.equal(stepJourneyEditorHistory(history,'redo'),null);assert.equal(history.past.length,50);
});

test('Undo across saved recipes saves to the original owner, preserves replacement, and keeps revision conflict protection',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-history-')),service=createLivingLightService({root,registry,resolveSong:async id=>({id})}),actor={mode:'authenticated-api',actor:{actorId:'agent:fixture',kind:'agent',displayName:'Fixture'}};
 try{
  const a=await service.saveJourney({journey:make('Original'),expectedRevision:null,idempotencyKey:'history:a'},actor),b=await service.saveJourney({journey:make('Replacement'),expectedRevision:null,idempotencyKey:'history:b'},actor);
  const edited=editJourneyDraft(editableJourney(a.journey),{type:'title',title:'Original edited'},registry);
  let history=recordJourneyEditorEdit({current:state(edited,identity(a)),past:[]},state(editableJourney(b.journey),identity(b),false));history=stepJourneyEditorHistory(history,'undo');
  const restored=history.current,saved=await service.saveJourney({journeyId:restored.identity.journeyId,journey:restored.draft,expectedRevision:restored.identity.revisionId,idempotencyKey:'history:restored'},actor);
  assert.equal(saved.journey.journeyId,a.journey.journeyId);assert.equal(saved.journey.parentRevisionId,a.journey.revisionId);assert.equal(service.journey(b.journey.journeyId).journey.revisionId,b.journey.revisionId);
  await assert.rejects(service.saveJourney({journeyId:restored.identity.journeyId,journey:{...restored.draft,title:'Stale'},expectedRevision:restored.identity.revisionId,idempotencyKey:'history:stale'},actor),error=>error.code==='revision_conflict');
  assert.equal(restored.draft.title,'Original edited');assert.equal(service.journey(a.journey.journeyId,a.journey.revisionId).journey.title,'Original');
 }finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});
