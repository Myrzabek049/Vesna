/* Vesna — резервная копия проекта в один файл .vesna (проект + все его медиафайлы) и восстановление */
'use strict';

V.backup = (() => {
  const B = {};
  const MAGIC = 'VESNA-PROJECT-1\n';

  /* Формат: MAGIC, 8 байт длины JSON, JSON-заголовок, затем файлы подряд */
  B.exportProject = async (projectId) => {
    const raw = await V.storage.getKV('project:' + projectId);
    if (!raw) return V.toast('Проект не найден');
    const state = JSON.parse(raw);
    const recs = (await V.storage.allMedia()).filter(r => (r.projects || []).includes(projectId));
    const head = {
      app: 'Vesna', version: V.VERSION, created: Date.now(), project: state,
      media: recs.map(r => ({ id: r.id, name: r.name, type: r.type, mime: r.blob.type, size: r.blob.size, added: r.added })),
    };
    const json = new TextEncoder().encode(JSON.stringify(head));
    const len = new Uint8Array(8);
    new DataView(len.buffer).setBigUint64(0, BigInt(json.length));
    const blob = new Blob([MAGIC, len, json, ...recs.map(r => r.blob)], { type: 'application/octet-stream' });
    const name = (state.name || 'проект').replace(/[\\/:*?"<>|]+/g, '_') + '.vesna';
    V.toast('Сохраняю копию проекта…', 30000);
    const where = await V.exporter.saveBlob(blob, name);
    V.toast(where ? `Копия сохранена: ${where} (${(blob.size / 1048576).toFixed(1)} МБ)` : 'Не удалось сохранить файл', 5000);
  };

  B.importFile = async (file) => {
    try {
      const head0 = await file.slice(0, MAGIC.length + 8).arrayBuffer();
      const magic = new TextDecoder().decode(head0.slice(0, MAGIC.length));
      if (magic !== MAGIC) throw new Error('Это не файл проекта Vesna');
      const jlen = Number(new DataView(head0, MAGIC.length, 8).getBigUint64(0));
      let off = MAGIC.length + 8;
      const head = JSON.parse(new TextDecoder().decode(await file.slice(off, off + jlen).arrayBuffer()));
      off += jlen;
      const state = head.project;
      const newId = V.uid('prj');
      const idMap = {};
      for (const m of head.media) {
        const blob = new Blob([await file.slice(off, off + m.size).arrayBuffer()], { type: m.mime });
        off += m.size;
        const nid = V.uid('med');
        idMap[m.id] = nid;
        await V.storage.putMedia({ id: nid, name: m.name, type: m.type, blob, added: m.added || Date.now(), projects: [newId] });
      }
      state.tracks.forEach(t => t.clips.forEach(c => { if (c.mediaId) c.mediaId = idMap[c.mediaId] || c.mediaId; }));
      state.id = newId;
      state.created = Date.now();
      await V.hub.addImported(state);
      V.toast(`Проект «${state.name}» восстановлен ✓`);
    } catch (e) {
      console.error(e);
      V.toast('Не удалось открыть файл: ' + e.message, 5000);
    }
  };

  return B;
})();
