// localStorage save/load. A save is JSON {version, savedAt, ...full sim state}.
(function (G) {
  const key = () => G.data.config.saveKey;
  G.Save = {
    save(sim) { try { const o = G.Sim.serialize(sim); o.savedAt = Date.now(); localStorage.setItem(key(), JSON.stringify(o)); return true; } catch (e) { console.warn("save failed", e); return false; } },
    load() { try { const s = localStorage.getItem(key()); return s ? G.Sim.deserialize(JSON.parse(s)) : null; } catch (e) { console.warn("load failed", e); return null; } },
    has() { try { return !!localStorage.getItem(key()); } catch (e) { return false; } }
  };
})(this.GS = this.GS || {});
