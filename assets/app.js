(() => {
  'use strict';
  const stories = window.YUMAO_STORIES;
  const $ = id => document.getElementById(id), screen = $('screen');
  if (!stories?.length) {screen.textContent='剧情没有加载成功，请保留整个文件夹后重新打开。';return;}
  const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=(name,cls='')=>`<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const num=n=>String(n).padStart(2,'0');
  const imageMap=window.YUMAO_IMAGE_MAP||{};
  const readSrc=src=>imageMap[src]?.read||src;
  const thumbSrc=src=>imageMap[src]?.thumb||readSrc(src);
  const imageSize=src=>imageMap[src]?`width="${imageMap[src].width}" height="${imageMap[src].height}"`:'';
  function watchFrame(){
    const frame=screen.querySelector('.frame'),img=frame?.querySelector('img');if(!img)return;
    const done=()=>{frame.classList.remove('image-loading','image-error');};
    const fail=()=>{frame.classList.remove('image-loading');frame.classList.add('image-error');};
    img.addEventListener('load',done,{once:true});img.addEventListener('error',fail,{once:true});
    if(img.complete){if(img.naturalWidth)done();else fail();}else frame.classList.add('image-loading');
  }
  const contexts=stories.map(story=>{
    const sceneById=Object.fromEntries(story.scenes.map(s=>[s.id,s]));
    const consultation=story.scenes.find(s=>s.lines.some(l=>l.kind==='consultation'));
    const publicScenes=story.scenes.filter(s=>s.id.startsWith('P')&&!s.lines.every(l=>l.kind==='consultation'));
    let consultText=consultation?.lines.filter(l=>l.kind==='consultation').map(l=>l.text).join('\n')||story.supplementalConsultation;
    function flatten(scenes){
      return scenes.flatMap(scene=>{
        const events=scene.lines.map((line,lineIndex)=>{
          const segment=scene.playbackSegments?.find(s=>lineIndex>=s.lineStart&&lineIndex<s.lineEndExclusive);
          const startLine=segment?.lineStart||0,image=segment?.image||scene.image;
          return {scene,line,lineIndex,image,startLine,key:`${scene.id}:${lineIndex}`,frameKey:`${scene.id}:${startLine}:${image}`};
        });
        if(scene.afterDialogueImage){
          const post=scene.screen?.find(s=>s.kind==='post');
          events.push({scene,line:{speaker:'周屿 · 朋友圈',kind:'screen',text:post?.text||'已发布',cue:''},lineIndex:scene.lines.length,image:scene.afterDialogueImage,startLine:scene.lines.length,key:`${scene.id}:screen`,frameKey:`${scene.id}:screen`,imageReveal:true});
        }
        return events;
      });
    }
    return {story,sceneById,publicScenes,publicEvents:flatten(publicScenes),consultation,consultText,consultImage:consultation?.image||publicScenes.at(-1).image,routeEvents:Object.fromEntries(story.options.map(o=>[o.id,flatten(story.scenes.filter(s=>s.id.startsWith(o.id)))]))};
  });
  const storageKey='yumao.public.story.v4';
  let fingerprint=window.YUMAO_CONTENT_FINGERPRINT;if(fingerprint===undefined){fingerprint=0;for(const c of JSON.stringify(stories))fingerprint=((fingerprint<<5)-fingerprint+c.charCodeAt(0))|0;}
  const fresh=()=>({phase:'read',cursor:0,route:null,selected:null,seen:[],completedRoutes:[]});
  let campaign={activeQuestionId:1,chapters:{},answers:{}},fontLarge=false,storageWorks=true,view='home',context=contexts[0],state=null,toastTimer;
  const validState=(s,c)=>s&&['read','choice','result','end'].includes(s.phase)&&Number.isInteger(s.cursor)&&s.cursor>=0&&Array.isArray(s.seen)&&Array.isArray(s.completedRoutes)&&(s.route===null||c.routeEvents[s.route])&&(s.selected===null||c.routeEvents[s.selected])&&(s.phase==='read'?s.cursor<c.publicEvents.length:s.phase==='result'?Boolean(s.route&&s.cursor<c.routeEvents[s.route].length):s.phase==='end'?Boolean(s.route):true);
  try{
    const probe=storageKey+'.probe';localStorage.setItem(probe,'1');localStorage.removeItem(probe);
    const saved=JSON.parse(localStorage.getItem(storageKey)||'null');
    if(saved?.version===2&&saved.fingerprint===String(fingerprint)&&saved.campaign?.chapters&&saved.campaign?.answers){
      campaign=saved.campaign;fontLarge=Boolean(saved.fontLarge);
      for(const c of contexts)if(campaign.chapters[c.story.questionId]&&!validState(campaign.chapters[c.story.questionId],c))delete campaign.chapters[c.story.questionId];
    }
  }catch{storageWorks=false;}
  context=contexts.find(c=>c.story.questionId===campaign.activeQuestionId)||contexts[0];state=campaign.chapters[context.story.questionId]||null;
  function save(){
    if(state)campaign.chapters[context.story.questionId]=state;
    campaign.activeQuestionId=context.story.questionId;
    if(!storageWorks)return;
    try{localStorage.setItem(storageKey,JSON.stringify({version:2,fingerprint:String(fingerprint),campaign,fontLarge}));}catch{storageWorks=false;}
  }
  const currentEvent=()=>state?.phase==='read'?context.publicEvents[state.cursor]:state?.phase==='result'?context.routeEvents[state.route][state.cursor]:null;
  const closeDialogs=()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close());
  const top=()=>window.scrollTo({top:0,behavior:'instant'});
  const completedCount=()=>stories.filter(q=>campaign.answers[q.questionId]?.complete).length;
  function remember(entry){if(!state.seen.some(e=>e.key===entry.key))state.seen.push(entry);}
  function rememberCurrent(){
    const e=currentEvent();
    if(e)remember({key:e.key,scene:e.scene.id,sceneTitle:e.scene.title,kind:e.line.kind,speaker:e.line.speaker,text:e.line.text,branch:state.phase==='result'});
    if(state.phase==='choice')remember({key:'consultation',scene:'consultation',sceneTitle:'问问与猫',kind:'consultation',speaker:context.story.consultant+' · 发给与猫',text:context.consultText,branch:false});
  }
  function useChapter(index,restart=false){
    if(!contexts[index])return;
    closeDialogs();save();context=contexts[index];
    state=restart?fresh():campaign.chapters[context.story.questionId]||fresh();
    if(restart)delete campaign.answers[context.story.questionId];
    campaign.chapters[context.story.questionId]=state;view='play';render();top();
  }
  function toast(text){clearTimeout(toastTimer);$('toast').textContent=text;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,2200);}
  function chapterCards(){return contexts.map((c,index)=>{
    const done=campaign.answers[c.story.questionId]?.complete,started=Boolean(campaign.chapters[c.story.questionId]);
    return `<button class="chapter-card" data-action="chapter" data-chapter="${index}"><div class="chapter-thumb"><img src="${esc(thumbSrc(c.story.scenes[0].image))}" alt="" loading="lazy" decoding="async" fetchpriority="low"><span>${num(index+1)}</span></div><div class="chapter-card-copy"><span class="chapter-state ${done?'done':''}">${done?'已读完':started?'继续阅读':'一段新的日常'}</span><h3>${esc(c.story.displayTitle)}</h3><p>${esc(c.story.consultant)}向你求助 ${icon('arrow')}</p></div></button>`;
  }).join('');}
  function renderHome(){
    const hasProgress=Object.keys(campaign.chapters).length>0;
    const cover=context.sceneById.A3?.image||contexts[0].sceneById.A3.image;
    screen.innerHTML=`<section class="home-view" data-view="home"><div class="home-hero"><div class="cover-art"><img src="${esc(readSrc(cover))}" alt="初夏和周屿相处的日常" fetchpriority="high" decoding="async"><span class="cover-stamp">每一件小事，都和你有关</span></div><div class="cover-copy"><div class="eyebrow">YUMAO AGENT · SIX LITTLE STORIES</div><h1>爱的小事，<br>听你一句。</h1><p>你是与猫。听听他们不太好开口的小烦恼，<br class="desktop-br">给一个建议，再看看故事会怎样继续。</p><button class="primary-button" data-action="${hasProgress?'resume':'start'}"><span>${hasProgress?'接着上次的故事':'从第一段日常开始'}</span>${icon('arrow')}</button><div class="home-progress"><span>${completedCount()} / 6 段日常已读完</span><span>${storageWorks?'进度自动保存':'本次在页面中暂存'}</span></div></div></div><section class="chapter-library" aria-labelledby="chapter-list-title"><div class="section-heading"><div><span class="eyebrow">OUR EVERYDAY STORIES</span><h2 id="chapter-list-title">也可以，从这件小事开始。</h2></div><span>六段日常 · 自由选读</span></div><div class="chapter-grid">${chapterCards()}</div></section><footer class="home-foot">林初夏 × 周屿　·　每个建议，都有故事里的回应。</footer></section>`;
  }
  function phaseHeading(phase){return `<div class="chapter-heading"><div><span class="eyebrow">CHAPTER ${num(context.story.displayChapter)} / 06</span><h1 class="chapter-name">${esc(context.story.displayTitle)}</h1></div><div class="phase-steps" aria-label="${['正在阅读故事','正在选择建议','正在看建议后的故事'][phase]}"><span class="${phase===0?'active':''}">故事</span><i></i><span class="${phase===1?'active':''}">建议</span><i></i><span class="${phase===2?'active':''}">后来</span></div></div>`;}
  function dialogueMarkup(line,index,current){
    let tag={thought:'心里想',narration:'故事旁白',screen:'屏幕内容'}[line.kind]||'';
    if(!tag&&context.story.questionId===6&&['B3','B4'].includes(currentEvent()?.scene.id))tag=line.cue?.includes('另一位同学')?'消息 · 发给另一位同学':'手机消息';
    const zhou=line.speaker.includes('周屿');
    return `<button class="dialogue-card dialogue-entry ${esc(line.kind)} ${current?'current text-change':'past'}" data-action="next" data-entry="${index}" tabindex="${current?'0':'-1'}" aria-label="继续阅读"><div class="speaker-row"><span class="speaker-dot ${zhou?'zhou':''}"></span><span class="speaker-name">${esc(line.speaker)}</span><span class="voice-tag">${tag}</span></div><p class="spoken" ${current?'id="spoken" aria-live="polite" aria-atomic="true"':''}>${esc(line.text)}</p></button>`;
  }
  function revealLatest(stream,smooth){requestAnimationFrame(()=>{
    if(!stream.isConnected)return;
    const entry=stream.querySelector('.current');if(!entry)return;
    const start=entry.getBoundingClientRect().top-stream.getBoundingClientRect().top+stream.scrollTop;
    const destination=entry.offsetHeight>stream.clientHeight-12?start-2:stream.scrollHeight-stream.clientHeight;
    stream.scrollTo({top:Math.max(0,destination),behavior:smooth&&!matchMedia('(prefers-reduced-motion: reduce)').matches?'smooth':'instant'});
  });}
  function renderReader(){
    const event=currentEvent(),{scene,line,lineIndex,image,frameKey}=event,isPublic=state.phase==='read';
    const scenes=isPublic?context.publicScenes:context.story.scenes.filter(s=>s.id.startsWith(state.route));
    const sceneIndex=scenes.findIndex(s=>s.id===scene.id);
    const panelMatch=line.cue?.match(/(左|中|右)(?:格|侧|半|边)/);
    const panel=panelMatch?.[1],panelCount=scene.lines.some(l=>/(?:中格|中间格)/.test(l.cue||''))?3:2;
    const panelIndex=panel==='右'?panelCount-1:panel==='中'?1:0;
    const guide=panel?`<span class="panel-guide" style="left:${100*panelIndex/panelCount}%;width:${100/panelCount}%"></span>`:'';
    const caption=`<span>${esc(scene.title)}</span><span class="panel-label">${event.imageReveal?'朋友圈已发布':panel?`${panelCount===3?'三格':'多格'}漫画 · 当前${panel}格`:`${num(sceneIndex+1)} / ${num(scenes.length)}`}</span>`;
    const events=isPublic?context.publicEvents:context.routeEvents[state.route];
    const frameEvents=events.filter(e=>e.frameKey===frameKey&&e.lineIndex<=lineIndex);
    const allFrameEvents=events.filter(e=>e.frameKey===frameKey);
    const position=`${num(frameEvents.length)} / ${num(allFrameEvents.length)}`;
    const last=state.cursor===events.length-1;
    const nextLabel=last?(isPublic?'问问与猫':'这一段的后来'):scene.afterDialogueImage&&lineIndex===scene.lines.length-1?'看看发出的朋友圈':'继续';
    const reader=screen.querySelector('.reader'),sameFrame=reader?.dataset.frame===frameKey&&reader?.dataset.question===String(context.story.questionId);
    const previousIndex=sameFrame?Number(reader.dataset.line):-1;
    if(sameFrame){
      const stream=reader.querySelector('.dialogue-stream'),old=stream.querySelector('.current');
      if(old&&previousIndex!==lineIndex){old.classList.remove('current','text-change');old.classList.add('past');old.tabIndex=-1;const p=old.querySelector('.spoken');p.removeAttribute('id');p.removeAttribute('aria-live');p.removeAttribute('aria-atomic');}
      while(stream.children.length>frameEvents.length)stream.lastElementChild.remove();
      for(let i=stream.children.length;i<frameEvents.length;i++)stream.insertAdjacentHTML('beforeend',dialogueMarkup(frameEvents[i].line,frameEvents[i].lineIndex,i===frameEvents.length-1));
      const latest=stream.lastElementChild;latest.classList.remove('past');latest.classList.add('current');latest.tabIndex=0;
      const p=latest.querySelector('.spoken');p.id='spoken';p.setAttribute('aria-live','polite');p.setAttribute('aria-atomic','true');
      reader.dataset.line=lineIndex;reader.querySelector('.line-position').textContent=position;
      reader.querySelector('.read-controls [data-action="next"] span').textContent=nextLabel;
      reader.querySelector('[data-action="prev"]').disabled=isPublic&&state.cursor===0;
      reader.querySelector('.scene-caption').innerHTML=caption;
      reader.querySelector('.panel-guide')?.remove();if(guide)reader.querySelector('.frame>button').insertAdjacentHTML('beforeend',guide);
      if(previousIndex!==lineIndex)revealLatest(stream,lineIndex>previousIndex);
    }else{
      screen.innerHTML=`<section class="reader" data-view="${state.phase}" data-question="${context.story.questionId}" data-scene="${scene.id}" data-frame="${esc(frameKey)}" data-line="${lineIndex}">${phaseHeading(isPublic?0:2)}<div class="scene-area"><figure class="frame scene-change"><button data-action="zoom" aria-label="放大查看本幕漫画"><img src="${esc(readSrc(image))}" ${imageSize(image)} alt="${esc(scene.title)}" fetchpriority="high" decoding="async">${guide}<span class="expand-label">${icon('zoom')}</span></button></figure><div class="scene-caption">${caption}</div></div><div class="reader-copy"><div class="dialogue-stream" role="region" aria-label="本幕已出现的对白">${frameEvents.map((e,i)=>dialogueMarkup(e.line,e.lineIndex,i===frameEvents.length-1)).join('')}</div></div><div class="read-controls"><button class="icon-button" data-action="prev" aria-label="返回上一句" ${isPublic&&state.cursor===0?'disabled':''}>${icon('back')}</button><span class="line-position">${position}</span><button class="primary-button" data-action="next"><span>${nextLabel}</span>${icon('arrow')}</button></div><p class="read-tip">点击对白继续　·　旧句可翻回查看　·　<span class="save-indicator">${storageWorks?'已保存':'暂存于页面'}</span></p></section>`;
      watchFrame();
      const stream=screen.querySelector('.dialogue-stream');revealLatest(stream,false);
      screen.querySelector('.frame img').decode().then(()=>{if(stream.isConnected)revealLatest(stream,false);}).catch(()=>{});
    }
    const next=events.slice(state.cursor+1).find(e=>e.image!==image);if(next)preload(next.image);
  }
  function renderChoice(){
    const name=context.story.consultant,isZhou=name.includes('周屿');
    screen.innerHTML=`<section class="choice-view" data-view="choice" data-question="${context.story.questionId}">${phaseHeading(1)}<div class="choice-layout"><div class="choice-art"><img src="${esc(readSrc(context.consultImage))}" decoding="async" alt="${esc(name)}正在斟酌如何开口"><div class="choice-art-note">有件小事，想听听你的建议。</div></div><div class="choice-sheet"><div class="consult-header"><span class="consult-initial ${isZhou?'zhou':''}">${isZhou?'屿':'夏'}</span><div><strong>${esc(name)}</strong><span>向与猫求助</span></div></div><p class="consult-question">${esc(context.consultText)}</p><div class="choices-title">${icon('spark')}如果是你，会怎样建议${isZhou?'他':'她'}？</div><div role="radiogroup" aria-label="选择建议">${context.story.options.map(o=>`<button class="option-card ${state.selected===o.id?'selected':''}" data-action="select" data-option="${o.id}" role="radio" aria-checked="${state.selected===o.id}" tabindex="${state.selected?state.selected===o.id?'0':'-1':o.id==='A'?'0':'-1'}"><span class="option-letter">${o.id}</span><span class="option-label">${esc(o.label)}</span>${icon('check','option-check')}</button>`).join('')}</div><button class="primary-button" data-action="confirm" ${state.selected?'':'disabled'}><span>${state.selected?'把这个建议告诉'+(isZhou?'他':'她'):'先选一个建议'}</span>${icon('arrow')}</button><button class="choice-back" data-action="back-story">← 再看看刚才的对话</button></div></div></section>`;
    if(state.selected)preload(context.routeEvents[state.selected][0].image);
  }
  const endingTitles={1:{A:'把喜欢的口味，说给他听。',B:'怎样被照顾，也可以一起商量。',C:'有些话，走着走着就说开了。'},2:{A:'这一次，两个人一起点头。',B:'照片留下，今天也很喜欢。',C:'这一张，留下开心的样子。'},3:{A:'原来，你那时就留意我了。',B:'故事没讲，人倒坐近了。',C:'同一个开始，两个人的记忆。'},6:{A:'一起准备，也各自认真。',B:'各自努力，日常的关心照旧。',C:'一起核对，也留一些给自己。'},7:{A:'走出来了，再听你说说。',B:'把事情说清楚，也陪在你身边。',C:'说到这里，我们换个位置。'},8:{A:'一起听到了，她想听的那首歌。',B:'海风很好，也可以留一点遗憾。',C:'新的地方，也有两个人的喜欢。'}};
  function renderEnd(){
    const story=context.story,option=story.options.find(o=>o.id===state.route),last=context.routeEvents[state.route].at(-1),index=contexts.indexOf(context);
    screen.innerHTML=`<section class="end-view" data-view="end" data-question="${story.questionId}"><div class="end-art"><img src="${esc(readSrc(last.image))}" decoding="async" alt="${esc(last.scene.title)}"></div><div class="end-copy"><span class="eyebrow">CHAPTER ${num(story.displayChapter)} · A MOMENT REMEMBERED</span><h1 class="end-title">${esc(endingTitles[story.questionId][state.route])}</h1><div class="recap-card"><h2>你给${story.consultant.includes('周屿')?'他':'她'}的建议</h2><p class="advice">${esc(option.label)}</p><h2>这一段的后来</h2><p>${esc(option.summary)}</p></div><button class="primary-button" data-action="${index<contexts.length-1?'next-chapter':'report'}"><span>${index<contexts.length-1?'下一段日常 · '+contexts[index+1].story.displayTitle:'查看完整恋爱报告'}</span>${icon('arrow')}</button><div class="end-secondary"><button class="secondary-button" data-action="rechoose">换个建议试试</button><button class="secondary-button" data-action="history">回看对话</button></div><div class="route-status">${story.options.map(o=>`<span class="${state.completedRoutes.includes(o.id)?'done':''}">${state.completedRoutes.includes(o.id)?icon('check'):'<i class="little-dot"></i>'}建议 ${o.id}</span>`).join('')}</div><button class="choice-back" data-action="chapters">查看全部章节</button></div></section>`;
  }
  let previewPattern='ABCABC';
  const designPreview=Boolean(window.YUMAO_RESULT_PREVIEW);
  function renderReport(){
    window.YumaoCompleteUI.render(screen,campaign.answers,{home:()=>{view="home";render();top();}});
  }
  function shareResult(){renderReport();}
  function exportResult(){renderReport();}

  function render(){
    document.documentElement.style.setProperty('--dialogue-size',fontLarge?'20px':'18px');
    if(view==='play'&&state)rememberCurrent();save();
    $('history-btn').hidden=view!=='play'||!state?.seen.length;
    $('header-tag').textContent=view==='home'?'六段日常 · 与猫':view==='report'?'我的恋爱报告':`${num(context.story.displayChapter)} / 06 · ${context.story.displayTitle}`;
    $('app').dataset.phase=view==='play'?state.phase:view;
    $('app').dataset.question=context.story.questionId;$('app').dataset.route=state?.route||'';
    if(view==='home')renderHome();else if(view==='report')renderReport();else if(state.phase==='choice')renderChoice();else if(state.phase==='end')renderEnd();else renderReader();
  }
  function next(){
    if(view!=='play'||!['read','result'].includes(state?.phase))return;
    const events=state.phase==='read'?context.publicEvents:context.routeEvents[state.route];
    if(state.cursor<events.length-1){const old=currentEvent().frameKey;state.cursor++;render();if(old!==currentEvent().frameKey)top();}
    else if(state.phase==='read'){state.phase='choice';state.cursor=0;render();top();}
    else{state.phase='end';if(!state.completedRoutes.includes(state.route))state.completedRoutes.push(state.route);campaign.answers[context.story.questionId]={optionId:state.route,complete:true};render();top();}
  }
  function prev(){
    if(view!=='play'||!state)return;
    if(['read','result'].includes(state.phase)&&state.cursor>0){const old=currentEvent().frameKey;state.cursor--;render();if(old!==currentEvent().frameKey)top();}
    else if(state.phase==='result'){state.phase='choice';state.selected=state.route;render();top();}
  }
  function showHistory(){
    let previous='',markup='';
    for(const entry of state?.seen||[]){if(entry.scene!==previous){markup+=`<div class="history-scene">${esc(entry.sceneTitle)}</div>`;previous=entry.scene;}markup+=`<article class="history-entry ${esc(entry.kind)}"><strong>${esc(entry.speaker)}${entry.kind==='thought'?' · 心里想':''}</strong><p>${esc(entry.text)}</p></article>`;}
    $('history-list').innerHTML=markup||'<p class="history-empty">开始故事后，对话会留在这里。</p>';$('history-dialog').showModal();
  }
  function showMenu(){
    $('font-btn').innerHTML=`阅读字号<span>${fontLarge?'大号 · 切回标准':'标准 · 切到大号'}</span>`;
    $('save-note').textContent=storageWorks?'六题进度自动保存在这个浏览器里。换浏览器或访问地址，存档不会同步。':'本次可继续游玩，但关闭页面后不会保留进度。';$('menu-dialog').showModal();
  }
  function showChapters(){closeDialogs();$('chapter-dialog-grid').innerHTML=chapterCards();$('chapters-dialog').showModal();}
  function showZoom(){
    const image=currentEvent()?.image||context.consultImage;$('zoom-image').src=image;$('zoom-image').alt=currentEvent()?.scene.title||context.story.displayTitle;
    $('zoom-scroll').classList.remove('enlarged');document.querySelector('[data-action="zoom-size"]').textContent='放大';$('zoom-dialog').showModal();$('zoom-scroll').scrollTo(0,0);
  }
  function select(option,focus){
    if(state?.phase!=='choice'||!context.routeEvents[option])return;
    state.selected=option;preload(context.routeEvents[option][0].image);const y=scrollY;render();window.scrollTo(0,y);if(focus)document.querySelector(`[data-option="${option}"]`).focus({preventScroll:true});
  }
  const loaded=new Map();let activePrefetch=null,pendingPrefetch=null;
  function preload(src){
    if(!src)return;src=readSrc(src);if(loaded.has(src))return;
    if(activePrefetch){pendingPrefetch=src;return;}
    const img=new Image();img.fetchPriority='low';img.decoding='async';loaded.set(src,img);activePrefetch=src;
    const finish=()=>{activePrefetch=null;const pending=pendingPrefetch;pendingPrefetch=null;if(pending)preload(pending);};
    img.onload=finish;img.onerror=()=>{loaded.delete(src);finish();};img.src=src;
  }
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]');if(close){$(close.dataset.close).close();return;}
    const target=e.target.closest('[data-action]');if(!target||target.disabled)return;
    const action=target.dataset.action;if(target.tagName==='A')e.preventDefault();
    if(action==='home'){closeDialogs();view='home';render();top();}
    else if(action==='start')useChapter(0,true);
    else if(action==='resume')useChapter(contexts.indexOf(context));
    else if(action==='chapter')useChapter(Number(target.dataset.chapter));
    else if(action==='restart')useChapter(contexts.indexOf(context),true);
    else if(action==='next-chapter')useChapter(contexts.indexOf(context)+1);
    else if(action==='next')next();else if(action==='prev')prev();
    else if(action==='chapters')showChapters();else if(action==='history')showHistory();else if(action==='menu')showMenu();
    else if(action==='report'){closeDialogs();view='report';render();top();}
    else if(action==='share-game'){closeDialogs();const url=location.href.split('#')[0].split('?')[0];if(navigator.share)navigator.share({title:'与猫 · 爱的小事，听你一句',text:'六段情侣日常，给个建议，看看你的恋爱画像。',url}).catch(e=>{if(e.name!=='AbortError')toast('可以复制浏览器地址分享给朋友');});else if(navigator.clipboard&&location.protocol!=='file:')navigator.clipboard.writeText(url).then(()=>toast('游戏链接已复制')).catch(()=>toast('可以复制浏览器地址分享给朋友'));else toast('上线后可复制游戏网址分享');}
    else if(action==='share-result')shareResult();
    else if(action==='export-result')exportResult();
    else if(action==='preview-pattern'){previewPattern=target.dataset.pattern;render();top();}
    else if(action==='select')select(target.dataset.option,true);
    else if(action==='confirm'&&state?.phase==='choice'&&state.selected){
      state.route=state.selected;state.phase='result';state.cursor=0;state.seen=state.seen.filter(e=>!e.branch);
      remember({key:'decision',scene:'decision',sceneTitle:'你给的建议',kind:'decision',speaker:'与猫',text:context.story.options.find(o=>o.id===state.route).label,branch:true});
      campaign.answers[context.story.questionId]={optionId:state.route,complete:false};render();top();
    }else if(action==='back-story'){state.phase='read';state.cursor=context.publicEvents.length-1;render();top();}
    else if(action==='rechoose'){state.phase='choice';state.selected=state.route;render();top();}
    else if(action==='font'){
      fontLarge=!fontLarge;render();$('font-btn').innerHTML=`阅读字号<span>${fontLarge?'大号 · 切回标准':'标准 · 切到大号'}</span>`;toast(fontLarge?'已切换为大号文字':'已切换为标准文字');
      const stream=screen.querySelector('.dialogue-stream');if(stream)revealLatest(stream,false);
    }else if(action==='zoom')showZoom();
    else if(action==='zoom-size'){const large=$('zoom-scroll').classList.toggle('enlarged');target.textContent=large?'还原':'放大';if(!large)$('zoom-scroll').scrollTo(0,0);}
  });
  document.addEventListener('keydown',e=>{
    if(document.querySelector('dialog[open]'))return;
    const option=e.target.closest('[data-option]');
    if(option&&['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const ids=context.story.options.map(o=>o.id),dir=['ArrowUp','ArrowLeft'].includes(e.key)?-1:1;select(ids[(ids.indexOf(option.dataset.option)+dir+ids.length)%ids.length],true);return;}
    if(e.target.closest('button,a,input,textarea,[contenteditable]'))return;
    if(view==='play'&&['read','result'].includes(state?.phase)){
      if([' ','ArrowRight','Enter'].includes(e.key)){e.preventDefault();next();}if(e.key==='ArrowLeft'){e.preventDefault();prev();}
    }
  });
  document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')save();});window.addEventListener('pagehide',save);
  if(designPreview)view='report';
  preload(contexts[0].story.scenes[0].image);render();
})();
