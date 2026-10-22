import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, AudioLines, Check, ChevronDown, CircleHelp, Clapperboard, Clock3, FileText, Film, Languages, LoaderCircle, LockKeyhole, Play, Plus, ScanSearch, ShieldCheck, Sparkles, Upload, Video, X } from 'lucide-react';
import './style.css';

const API_BASE = 'http://127.0.0.1:8000';

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [language, setLanguage] = useState('auto');
  const [model, setModel] = useState('small');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('transcript');
  const [exporting, setExporting] = useState(false);
  const [xUrl, setXUrl] = useState('');
  const [urlBusy, setUrlBusy] = useState(false);

  function chooseFile(f) {
    if (!f) return;
    if (f.size > 1024 * 1024 * 1024) {
      setError('File is larger than 1 GB. Choose a smaller video for this starter version.');
      return;
    }
    setError('');
    setResult(null);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  function onDrop(e) {
    e.preventDefault();
    chooseFile(e.dataTransfer.files?.[0]);
  }

  async function analyze() {
    if (!file) return;
    setBusy(true); setError(''); setResult(null);
    setProgress('Uploading video securely to your local backend…');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('language', language === 'auto' ? '' : language);
      body.append('model', model);
      setProgress('Transcribing speech. This can take a while on CPU…');
      const response = await fetch(`${API_BASE}/api/transcribe`, { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'The backend could not process this video. Is the API running?');
      setResult(data);
      setTab('transcript');
      setProgress('');
    } catch (e) {
      setError(e.message || 'Something went wrong. Start the backend and try again.');
      setProgress('');
    } finally { setBusy(false); }
  }

  async function analyzeXUrl() {
    if (!xUrl.trim()) return;
    setUrlBusy(true); setError(''); setResult(null);
    setProgress('Fetching public X video and transcribing speech…');
    try {
      const body = new FormData();
      body.append('url', xUrl.trim());
      body.append('language', language === 'auto' ? '' : language);
      body.append('model', model);
      const response = await fetch(`${API_BASE}/api/transcribe-x-url`, { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Could not analyze this X post.');
      setResult(data); setFile(null); setPreview(''); setTab('transcript'); setProgress('');
    } catch (e) {
      setError(e.message || 'X URL analysis failed. Check that the backend is running and yt-dlp is installed.');
      setProgress('');
    } finally { setUrlBusy(false); }
  }

  function downloadSrt() {
    if (!result?.srt) return;
    const blob = new Blob([result.srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${file?.name?.replace(/\.[^.]+$/, '') || 'subtitles'}.srt`; a.click();
    URL.revokeObjectURL(url);
  }

  const transcript = result?.segments?.map(s => s.text).join(' ').trim() || '';

  function downloadReport() {
    if (!result) return;
    const lines = [
      'MVG VIDEO TRANSCRIPT REPORT',
      '===========================',
      `Source file: ${file?.name || result.filename || 'Unknown'}`,
      `Detected language: ${result.language || 'Unknown'}`,
      `Duration: ${formatTime(result.duration || 0)}`,
      `Transcript segments: ${result.segments?.length || 0}`,
      '',
      'TRANSCRIPT',
      '----------',
      ...(result.segments || []).map(s => `[${formatTime(s.start)}] ${s.text}`),
      '',
      'REVIEW NOTE',
      '-----------',
      'Machine-generated transcription may contain mistakes. Verify names, dates, translations, and claims before publication.'
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = `${file?.name?.replace(/\.[^.]+$/, '') || 'mvg-report'}-report.txt`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportSubtitledVideo() {
    if (!file || !result?.srt || !file.type.startsWith('video/')) return;
    setExporting(true); setError(''); setProgress('Burning subtitles into the video. This may take a few minutes…');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('srt', result.srt);
      const response = await fetch(`${API_BASE}/api/burn-subtitles`, { method: 'POST', body });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || 'Subtitle export failed. Check that the backend has been updated.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${file.name.replace(/\.[^.]+$/, '')}-subtitled.mp4`; a.click();
      URL.revokeObjectURL(url);
      setProgress('Subtitle video exported.');
    } catch (e) {
      setError(e.message || 'Subtitle export failed.');
      setProgress('');
    } finally { setExporting(false); }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={20}/></div><div><strong>MVG</strong><span>VIDEO INTELLIGENCE</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <button className="nav-item active"><ScanSearch size={17}/> Video analysis <span className="nav-dot"/></button>
      <button className="nav-item" onClick={() => setError('Subtitle editor is planned for a future update.')}><AudioLines size={17}/> Subtitle studio</button>
      <button className="nav-item" onClick={() => setError('Report generation is planned for a future update.')}><FileText size={17}/> Reports</button>
      <div className="sidebar-bottom">
        <div className="privacy-card"><ShieldCheck size={18}/><div><b>Privacy first</b><p>Transcription runs on your own backend.</p></div></div>
        <div className="user-chip"><div className="avatar">M</div><div><b>My workspace</b><span>Local project</span></div><ChevronDown size={15}/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <b>Video analysis</b></div><div className="top-actions"><span className="status"><i/> Local workspace</span><button className="icon-button" title="Help" onClick={() => setError('Upload a video, select a language, then click Generate transcript. Start the backend first.')}><CircleHelp size={18}/></button></div></header>
      <div className="page-content">
        <section className="page-heading"><div><div className="eyebrow"><Sparkles size={14}/> AI-ASSISTED WORKSPACE</div><h1>Understand every <span>frame.</span></h1><p>Turn video into searchable speech, subtitles, and a clearer starting point for your report.</p></div><div className="heading-icon"><Clapperboard size={26}/></div></section>

        <div className="steps"><div className="step current"><span>01</span><div><b>Upload</b><small>Add your video</small></div></div><div className="step-line"/><div className={`step ${result ? 'done' : ''}`}><span>{result ? <Check size={15}/> : '02'}</span><div><b>Transcribe</b><small>Extract spoken words</small></div></div><div className="step-line"/><div className="step"><span>03</span><div><b>Review</b><small>Export your output</small></div></div></div>

        <div className="content-grid">
          <section className="panel upload-panel">
            <div className="panel-head"><div><div className="panel-kicker">SOURCE FILE</div><h2>Video input</h2></div><span className="file-limit"><LockKeyhole size={12}/> Local processing</span></div>
            {!file ? <>
            <div className="dropzone" onDragOver={e => e.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}>
              <input ref={inputRef} type="file" accept="video/*,audio/*" hidden onChange={e => chooseFile(e.target.files?.[0])}/>
              <div className="upload-icon"><Upload size={22}/></div><h3>Drop your video here</h3><p>or <span>browse files</span> from your device</p><div className="file-types"><span>MP4</span><span>MOV</span><span>WEBM</span><span>MP3</span><span>MAX 1 GB</span></div>
            </div>
            <div className="or-divider"><span>OR USE A PUBLIC POST URL</span></div>
            <div className="url-entry"><div className="url-input-wrap"><Video size={16}/><input value={xUrl} onChange={e => setXUrl(e.target.value)} placeholder="https://x.com/user/status/…" aria-label="Public X post URL"/></div><button className="url-button" disabled={!xUrl.trim() || urlBusy || busy} onClick={analyzeXUrl}>{urlBusy ? <LoaderCircle size={15} className="spin"/> : <ScanSearch size={15}/>} Analyze URL</button></div>
            <p className="url-help">Public posts only. Private, login-restricted, or unavailable videos may not work.</p>
            </> : <div className="file-preview">
              {preview && file.type.startsWith('video/') ? <video src={preview} controls /> : <div className="audio-placeholder"><Film size={30}/><span>Audio source selected</span></div>}
              <div className="file-info"><div className="file-symbol"><Video size={18}/></div><div className="file-name"><b>{file.name}</b><span>{(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to process</span></div><button className="icon-button" onClick={() => {setFile(null);setPreview('');setResult(null);}} title="Remove file"><X size={17}/></button></div>
            </div>}
            <div className="divider"/>
            <div className="settings-title"><span>TRANSCRIPTION SETTINGS</span><span className="optional">Configure output</span></div>
            <label className="field-label">Spoken language</label><div className="select-wrap"><Languages size={16}/><select value={language} onChange={e => setLanguage(e.target.value)}><option value="auto">Auto-detect language</option><option value="bn">Bangla (বাংলা)</option><option value="en">English</option><option value="hi">Hindi</option><option value="ur">Urdu</option><option value="ar">Arabic</option><option value="ru">Russian</option><option value="uk">Ukrainian</option></select><ChevronDown size={15}/></div>
            <label className="field-label">Whisper model</label><div className="select-wrap"><Sparkles size={16}/><select value={model} onChange={e => setModel(e.target.value)}><option value="tiny">Tiny — fastest, lower accuracy</option><option value="base">Base — lightweight</option><option value="small">Small — balanced</option><option value="medium">Medium — higher accuracy, slower</option></select><ChevronDown size={15}/></div>
            <div className="note"><Activity size={15}/><p>Models run locally on the machine hosting the backend. Larger models need more memory and processing time.</p></div>
            <button className="primary-button" disabled={!file || busy} onClick={analyze}>{busy ? <><LoaderCircle className="spin" size={17}/> Processing video…</> : <><Sparkles size={17}/> Generate transcript <span>→</span></>}</button>
            {progress && <div className="progress-line"><LoaderCircle className="spin" size={15}/>{progress}</div>}
            {error && <div className="error-message"><X size={15}/><span>{error}</span><button onClick={() => setError('')}><X size={13}/></button></div>}
          </section>

          <section className="panel output-panel">
            <div className="panel-head"><div><div className="panel-kicker">ANALYSIS OUTPUT</div><h2>Transcript workspace</h2></div><span className={`result-state ${result ? 'ready' : ''}`}><i/>{result ? 'Completed' : 'Awaiting input'}</span></div>
            {!result ? <div className="empty-output"><div className="empty-art"><div className="art-ring ring-one"/><div className="art-ring ring-two"/><div className="art-core"><AudioLines size={28}/></div><div className="float-chip chip-a"><FileText size={14}/> TXT</div><div className="float-chip chip-b"><Languages size={14}/> SRT</div></div><h3>Your analysis starts here</h3><p>Upload a video and generate a transcript to review spoken content and download subtitle files.</p><div className="output-features"><div><Check size={14}/> Timestamped transcript</div><div><Check size={14}/> SRT subtitle export</div><div className="planned"><Clock3 size={14}/> Visual analysis & fact-checking <small>Planned</small></div></div></div> : <>
              <div className="result-stats"><div><span>SEGMENTS</span><b>{result.segments?.length || 0}</b></div><div><span>LANGUAGE</span><b>{result.language || 'Detected'}</b></div><div><span>DURATION</span><b>{formatTime(result.duration || 0)}</b></div></div>
              <div className="tabs"><button className={tab === 'transcript' ? 'selected' : ''} onClick={() => setTab('transcript')}>Transcript</button><button className={tab === 'subtitles' ? 'selected' : ''} onClick={() => setTab('subtitles')}>SRT preview</button><button className={tab === 'summary' ? 'selected' : ''} onClick={() => setTab('summary')}>Quick overview</button></div>
              <div className="transcript-content">{tab === 'transcript' ? (result.segments || []).map((s, i) => <div className="transcript-row" key={i}><span>{formatTime(s.start)}</span><p>{s.text}</p></div>) : tab === 'subtitles' ? <pre>{result.srt}</pre> : <div className="overview-content"><h3>Transcript overview</h3><p>This is a quick extractive overview, not an AI fact-check. Review the full transcript before drawing conclusions.</p><div className="overview-stat"><b>{result.segments?.length || 0}</b><span>timestamped speech segments</span></div>{(result.segments || []).slice().sort((a,b) => (b.text || '').length - (a.text || '').length).slice(0,5).map((s,i) => <div className="overview-item" key={i}><span>{formatTime(s.start)}</span><p>{s.text}</p></div>)}</div>}{!result.segments?.length && <p>{transcript || 'No speech was detected.'}</p>}</div>
              <button className="download-button" onClick={downloadSrt}><ArrowDownToLine size={16}/> Download SRT subtitle <span>↓</span></button>
              <button className="download-button secondary-download" onClick={downloadReport}><FileText size={16}/> Export transcript report (.txt) <span>↓</span></button>
              {file?.type.startsWith('video/') && <button className="download-button video-export" onClick={exportSubtitledVideo} disabled={exporting}><Film size={16}/>{exporting ? 'Exporting MP4…' : 'Export MP4 with burned-in subtitles'} <span>↓</span></button>}
            </>}
          </section>
        </div>
        <section className="workflow-strip"><div className="workflow-icon"><ShieldCheck size={18}/></div><div><b>Built for careful reporting</b><p>Transcripts can contain errors. Verify names, dates, translations, and claims against reliable sources before publishing.</p></div><span className="workflow-tag">MVP · v0.1</span></section>
        <footer><span>© 2026 MVG Studio</span><span><i/> Local API connection required</span><span>Made for clearer reporting</span></footer>
      </div>
    </main>
  </div>;
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

createRoot(document.getElementById('root')).render(<App/>);