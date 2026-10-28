// The dashboards' shared look: one palette with fixed meanings, and the defaults every chart follows, chosen for
// clarity and accessibility. house_theme.py puts this block at
// the top of every chart's code and passes the chart's options through HOUSE.finish, so a change here reaches every
// chart the next time house_theme.py runs.
const HOUSE = (() => {
  // Every colour is at least 3:1 against Grafana's dark panel (#181b1f), the minimum for chart marks, and most are
  // 5.5:1 or more; the source colours stay distinct for the three common kinds of colour blindness. Dashboards are
  // dark theme only.
  const C = {
    text: '#d8d9da', muted: '#9ca3af', grid: 'rgba(255,255,255,0.12)',
    focus: '#c084fc',    // the council and its totals: the one highlight colour (a council may set its own here)
    context: '#8b929c',  // everything shown for comparison: other organisations, other years
    baseline: '#d8d9da', // the status quo, business as usual
    good: '#4cc38a', bad: '#f2665c', // direction markers only, always beside words ("down 6.9%")
  };
  // Emissions sources keep one colour on every dashboard
  const SOURCES = {
    Electricity: '#ff6fb5', Gas: '#e69f00', Fleet: '#c6f432', Water: '#7ad3f5', Waste: '#a0703c',
    Refrigerants: '#8fd16a', Other: '#8b929c',
  };
  const SOURCE_NAMES = [
    [/^electricity\b/i, 'Electricity'], [/^(buildings |leisure centres? )?gas\b/i, 'Gas'], [/^fleet\b/i, 'Fleet'],
    [/^water\b/i, 'Water'], [/^(corporate )?waste\b/i, 'Waste'], [/^refrigerants?\b/i, 'Refrigerants'], [/^other\b/i, 'Other'],
  ];
  // Each dashboard's own colour, for its headline tiles (and the Homepage's tile from that theme). A tile about an
  // emissions source keeps the source's colour; Fleet and Circular Economy and Waste share their source's colour.
  // Each tile also has its title, so colour is never the only cue.
  const THEMES = {
    'Energy and Emissions': C.focus, Fleet: '#c6f432', 'Circular Economy and Waste': '#a0703c', Buildings: '#e69f00',
    Biodiversity: '#6fe3c7', 'Trees and Greening': '#8fd16a', Overarching: '#ff8f8f', 'Community Emissions Profile': '#e4e4e4',
  };
  // Parts of one source (water from three places): the source's colour in three lightnesses
  const SHADES = { Water: ['#bce9fa', '#7ad3f5', '#437487'], Trees: ['#4f733a', '#6b9d50', '#8fd16a'] };
  // The waste streams the council collects, the same on every chart and tile
  const STREAMS = {
    'Garbage collected': SOURCES.Waste, 'Commingled recycling collected': '#4da3ff',
    'Food and garden organics collected': '#8fd16a', 'Hard waste collected': '#e8743b',
  };
  // The fleet's fuels and vehicle types: shades of the fleet's lime, petrol and diesel vehicles in grey
  const FUELS = {
    'Unleaded petrol': '#c6f432', Diesel: '#8bab23', LPG: '#637a19', 'Ethanol Blend': '#e5faa3',
    'ICE vehicles': C.context, 'Hybrid vehicles': '#8bab23', 'Electric vehicles': '#c6f432',
  };
  // A strategy action's status, from not started to achieved, the same on every dashboard (the status is also written
  // on the bar, so colour is never the only cue)
  const STATUS = {
    'Not started': '#8b929c', 'Under review': '#f0e442', 'Action needed': '#e8743b', 'On track': '#4da3ff', 'Achieved': '#4cc38a',
  };
  // Any other chart with several series takes its colours in this order: six at most, then grey
  const CATEGORICAL = [C.focus, '#e69f00', '#7ad3f5', '#ff6fb5', '#8fd16a', '#e8743b', C.context];

  const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
  const fmt = (v, dp) => {
    if (typeof v !== 'number' || !isFinite(v)) return '';
    const d = dp != null ? dp : Math.abs(v) >= 100 ? 0 : 1;
    return v.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: d });
  };
  const short = (v) => (Math.abs(v) >= 1e6 ? fmt(v / 1e6, 1) + 'm' : Math.abs(v) >= 1e4 ? fmt(v / 1e3, 0) + 'k' : fmt(v));
  const sourceColour = (name) => {
    const hit = SOURCE_NAMES.find(([re]) => re.test(String(name || '')));
    return hit ? SOURCES[hit[1]] : null;
  };
  const value = (v) => (v && typeof v === 'object' ? (Array.isArray(v) ? v[v.length - 1] : v.value) : v);

  // every object in the options, without descending into long data arrays
  const walk = (o, fn, depth) => {
    if (!o || typeof o !== 'object' || (depth || 0) > 10) return;
    if (Array.isArray(o)) {
      if (o.length > 60 || (o.length && typeof o[0] !== 'object')) return;
      o.forEach((x) => walk(x, fn, (depth || 0) + 1));
      return;
    }
    fn(o);
    Object.keys(o).forEach((k) => walk(o[k], fn, (depth || 0) + 1));
  };

  // A screen reader's description, from what the chart draws: its title, then each series' first and last values
  const describe = (opt, title) => {
    const parts = [title || 'Chart'];
    const axis = arr(opt.xAxis).concat(arr(opt.yAxis)).find((a) => a && Array.isArray(a.data)) || {};
    const cats = (axis.data || []).map((c) => (c && typeof c === 'object' ? c.value : c));
    arr(opt.series).slice(0, 4).forEach((s) => {
      const data = arr(s.data);
      if (s.type === 'pie' || s.type === 'funnel') {
        const items = data.filter((d) => d && typeof d.value === 'number').sort((a, b) => b.value - a.value).slice(0, 4);
        if (items.length) parts.push(items.map((d) => d.name + ' ' + fmt(d.value)).join(', '));
        return;
      }
      const vals = data.map(value).map((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : v));
      const idx = vals.map((v, i) => (typeof v === 'number' && isFinite(v) ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return;
      // categories that aren't years (sources, buildings): the largest four, not the first and last
      if (cats.length && !cats.some((c) => /^\d{4}(\/\d{2})?$/.test(String(c)))) {
        const top = idx.slice().sort((a, b) => vals[b] - vals[a]).slice(0, 4);
        parts.push((s.name ? s.name + ': ' : 'Largest: ') + top.map((i) => cats[i] + ' ' + fmt(vals[i])).join(', '));
        return;
      }
      const first = idx[0], last = idx[idx.length - 1];
      const name = s.name || 'Values';
      if (first === last) parts.push(name + ': ' + fmt(vals[first]) + (cats[first] != null ? ' (' + cats[first] + ')' : ''));
      else parts.push(name + ': ' + fmt(vals[first]) + (cats[first] != null ? ' in ' + cats[first] : '') + ', ' +
        fmt(vals[last]) + (cats[last] != null ? ' in ' + cats[last] : ''));
    });
    arr(opt.title).forEach((t) => {
      if (t && typeof t.text === 'string' && /\d/.test(t.text)) parts.push(t.text.replace(/\{\w+\|([^}]*)\}/g, '$1').replace(/\n/g, '. ').replace(/[ \t]+/g, ' ').trim());
    });
    return parts.join('. ').replace(/[▲▼]\s*/g, '').replace(/\n/g, '. ').replace(/\.\s*\./g, '.') + '.';
  };

  // A series with no values is left out (a metric the council marked dormant or
  // not_applicable comes off the dashboards; its figures leave the snapshots, so its series arrives empty), and so is
  // a category every series is empty for. A financial year stays, as a gap. A pie loses its empty slices. The Change
  // Report says what went from each panel.
  const pointValue = (d) => {
    const v = d && typeof d === 'object' && !Array.isArray(d) ? d.value : d;
    return Array.isArray(v) ? v[v.length - 1] : v;
  };
  const blank = (v) => v === null || v === undefined || v === '' || v === '-' || (typeof v === 'number' && isNaN(v));
  const dropEmpty = (opt) => {
    if (!Array.isArray(opt.series)) return;
    opt.series.forEach((s) => {
      if (s && s.type === 'pie' && Array.isArray(s.data)) s.data = s.data.filter((d) => !blank(pointValue(d)));
    });
    const empty = (s) => s && typeof s === 'object' && s.type !== 'pie' && Array.isArray(s.data) && s.data.length > 0
      && !s.markLine && !s.markArea && !s.markPoint && s.data.every((d) => blank(pointValue(d)));
    const gone = opt.series.filter(empty).map((s) => s.name);
    if (gone.length) {
      opt.series = opt.series.filter((s) => !empty(s));
      arr(opt.legend).forEach((l) => {
        if (l && Array.isArray(l.data)) l.data = l.data.filter((n) => !gone.includes(n && typeof n === 'object' ? n.name : n));
      });
    }
    [...arr(opt.xAxis), ...arr(opt.yAxis)].forEach((a, i, axes) => {
      if (!a || a.type !== 'category' || !Array.isArray(a.data) || !a.data.length) return;
      if (a.data.some((c) => /^\d{4}\/\d{2}$/.test(String(c && typeof c === 'object' ? c.value : c)))) return;
      const isX = i < arr(opt.xAxis).length;
      const idx = isX ? i : i - arr(opt.xAxis).length;
      const on = opt.series.filter((s) => s && (s.type === 'bar' || s.type === 'line')
        && ((isX ? s.xAxisIndex : s.yAxisIndex) || 0) === idx);
      if (!on.length || on.some((s) => !Array.isArray(s.data) || s.data.length !== a.data.length
          || s.data.some((d) => Array.isArray(d) || (d && typeof d === 'object' && Array.isArray(d.value))))) return;
      const keep = a.data.map((_, k) => on.some((s) => !blank(pointValue(s.data[k]))));
      if (keep.every(Boolean)) return;
      a.data = a.data.filter((_, k) => keep[k]);
      on.forEach((s) => { s.data = s.data.filter((_, k) => keep[k]); });
    });
  };

  // The defaults every chart follows. meta: { title, sources } (sources: colour series by emissions source)
  const finish = (opt, context, meta) => {
    if (!opt || typeof opt !== 'object') return opt;
    meta = meta || {};
    dropEmpty(opt);
    const g = context && context.grafana;
    const title = g && g.replaceVariables ? g.replaceVariables(meta.title || '') : meta.title || '';
    opt.animation = false;
    walk(opt, (o) => { if (typeof o.fontSize === 'number' && o.fontSize < 12) o.fontSize = 12; });
    const series = arr(opt.series);
    series.forEach((s) => {
      if (!s || typeof s !== 'object') return;
      if (s.type === 'line') {
        s.smooth = false;
        s.lineStyle = s.lineStyle || {};
        if (typeof s.lineStyle.width !== 'number' || s.lineStyle.width < 2) s.lineStyle.width = 2;
      }
      const c = meta.sources && sourceColour(s.name);
      if (c) {
        s.itemStyle = Object.assign({}, s.itemStyle, { color: c });
        if (s.type === 'line') s.lineStyle.color = c;
      }
    });
    // Shading under a line shows the figure's size, so it needs an axis from zero: a lone line on such an axis is
    // lightly shaded in its own colour, and any shading on an axis that doesn't start at zero is removed
    const yAxes = arr(opt.yAxis);
    const fromZero = (s) => {
      const a = yAxes[s.yAxisIndex || 0];
      return !!a && !a.scale && a.min !== 'dataMin' && typeof a.min !== 'function' && !(typeof a.min === 'number' && a.min > 0);
    };
    const lines = series.filter((s) => s && s.type === 'line');
    lines.forEach((s) => {
      if (s.areaStyle && !fromZero(s)) delete s.areaStyle;
    });
    if (lines.length === 1 && !lines[0].areaStyle && !lines[0].stack && fromZero(lines[0])) lines[0].areaStyle = { opacity: 0.15 };
    // shading is always the line's own colour (a stacked range band keeps its own)
    lines.forEach((s) => {
      const c = s.lineStyle && s.lineStyle.color;
      if (s.areaStyle && !s.stack && typeof c === 'string') {
        s.areaStyle = Object.assign({}, s.areaStyle, { color: c, opacity: typeof s.areaStyle.opacity === 'number' ? s.areaStyle.opacity : 0.15 });
      }
    });
    // a long run of financial years: every fifth (or so) labelled, written in full and level, not slanted and cut off
    arr(opt.xAxis).forEach((a) => {
      if (a && a.type === 'category' && Array.isArray(a.data) && a.data.length > 12
          && a.data.every((c) => /^\d{4}\/\d{2}$/.test(String(c && typeof c === 'object' ? c.value : c)))) {
        a.axisLabel = Object.assign({}, a.axisLabel, { interval: Math.ceil(a.data.length / 6) - 1, rotate: 0, hideOverlap: true });
      }
    });
    // two to six lines: each named at its end, so no one has to match colours to a legend (not the invisible lines
    // that only draw a shaded range)
    const named = lines.filter((s) => !s.silent && !(s.lineStyle && s.lineStyle.opacity === 0));
    const lastOf = (s) => { const d = Array.isArray(s.data) ? s.data[s.data.length - 1] : null; return d && typeof d === 'object' && !Array.isArray(d) ? d.value : d; };
    if (named.length >= 2 && named.length <= 6 && named.every((s) => s.name && !s.endLabel)) {
      // a line that stops before the last year isn't named mid-chart: the legend names it
      named.filter((s) => lastOf(s) != null).forEach((s) => {
        const c = (s.lineStyle && s.lineStyle.color) || (s.itemStyle && s.itemStyle.color);
        s.endLabel = { show: true, formatter: '{a}', fontSize: 12, color: typeof c === 'string' ? c : C.text };
      });
      // room for the longest name (about 7 pixels a character at 12 pixels), and no legend repeating the names
      const room = Math.max(160, Math.max(...named.map((s) => String(s.name).length)) * 7 + 24);
      arr(opt.grid).forEach((g) => {
        if (g && (typeof g.right !== 'number' || g.right < room)) g.right = room;
      });
      if (!opt.grid) opt.grid = { right: room, containLabel: true };
    }
    // every line named at its end: a legend would only repeat the names
    if (lines.length >= 2 && series.every((s) => s && s.type === 'line' && s.endLabel && s.endLabel.show)) {
      arr(opt.legend).forEach((l) => { if (l) l.show = false; });
    }
    // a series that only draws shading (a range band) shows its shade's colour in the legend, not the next default
    lines.forEach((s) => {
      const c = s.areaStyle && s.areaStyle.color;
      if (typeof c === 'string' && !(s.itemStyle && s.itemStyle.color)) s.itemStyle = Object.assign({}, s.itemStyle, { color: c });
    });
    // a subtitle across the top and an axis name above the axis: room for both, so they don't sit on each other
    const subtitle = arr(opt.title).some((t) => t && t.text && !t.subtext && (t.top == null || t.top === 0) && t.left !== 'center');
    const nameOnTop = yAxes.some((a) => a && a.name && (a.nameLocation == null || a.nameLocation === 'end'));
    if (subtitle && nameOnTop) {
      arr(opt.grid).forEach((g) => { if (g && !(typeof g.top === 'number' && g.top >= 60)) g.top = 60; });
    }
    // line-end labels that would overlap move apart
    lines.forEach((s) => { if (s.endLabel && !s.labelLayout) s.labelLayout = { moveOverlap: 'shiftY' }; });
    // bars always start at zero
    if (series.some((s) => s && s.type === 'bar')) {
      arr(opt.xAxis).concat(arr(opt.yAxis)).forEach((a) => {
        if (!a || a.type === 'category' || a.type === 'time') return;
        if (a.scale) a.scale = false;
        if (a.min === 'dataMin' || (typeof a.min === 'number' && a.min > 0)) a.min = 0;
      });
    }
    if (!opt.color) opt.color = CATEGORICAL;
    if (!opt.aria) opt.aria = { enabled: true, label: { description: describe(opt, title) } };
    return opt;
  };

  // ---------------------------------------------------------------- building blocks for chart code
  // A query column's values: HOUSE.col(context, 'Value') (first frame unless another is given)
  // (any of the panel's queries: a tile's target comes from a second query)
  const col = (context, name, frame) => {
    const frames = context.panel.data.series || [];
    const pick = frame != null ? [frames[frame]] : frames;
    for (const fr of pick) {
      const f = fr && fr.fields.find((x) => x.name === name);
      if (f) return Array.from(f.values.buffer || f.values);
    }
    return [];
  };
  // A tile's one value: its Value column, or else the first number the query returns
  const first = (context, name) => {
    const v = col(context, name || 'Value');
    if (v.length) return v[0];
    const f = ((context.panel.data.series || [])[0] || { fields: [] }).fields.find((x) => x.type === 'number');
    const n = f ? (f.values.buffer || f.values)[0] : null;
    return n == null ? null : n;
  };
  // A value times a factor, keeping no figure as no figure (in JavaScript null * 100 is 0: a switched-off headline
  // read 0%, golden run, Run 2)
  const times = (v, k) => (v == null || !isFinite(v) ? null : v * k);
  const size = (context) => ({
    w: Math.max((context.panel.chart && context.panel.chart.getWidth && context.panel.chart.getWidth()) || 0, context.panel.width || 0) || 300,
    h: Math.max((context.panel.chart && context.panel.chart.getHeight && context.panel.chart.getHeight()) || 0, context.panel.height || 0) || 150,
  });

  // A headline tile: the value in neutral text, then one comparison line, then an optional note.
  // t: { value, unit, dp, color, prior, priorLabel, higherIsBetter, target, note }. The number takes the colour of what it
  // measures (a source's colour, or the council's for a total); the arrow alone shows good or bad.
  const tile = (context, t) => {
    const { w, h } = size(context);
    const lines = [];
    if (t.prior != null && t.value != null && isFinite(t.prior)) {
      const diff = t.value - t.prior;
      const pct = t.prior !== 0 ? (diff / Math.abs(t.prior)) * 100 : null;
      if (Math.abs(diff) < 1e-9) lines.push('{cmp|No change on ' + t.priorLabel + '}');
      else {
        // higherIsBetter true or false colours the arrow; left out, the arrow stays grey (no good or bad direction)
        const good = t.higherIsBetter == null ? null : t.higherIsBetter ? diff > 0 : diff < 0;
        const arrow = diff < 0 ? '▼' : '▲';
        // a percentage changes by points ("1.0 point"), not by a percentage of itself
        const points = Math.abs(diff);
        const amount = t.unit === '%' ? fmt(points, 1) + (Math.abs(points - 1) < 1e-9 ? ' point' : ' points')
          : pct != null && Math.abs(pct) < 1000 ? fmt(Math.abs(pct), 1) + '%' : fmt(Math.abs(diff), t.dp) + ' ' + (t.unit || '');
        lines.push('{' + (good == null ? 'cmp' : good ? 'good' : 'bad') + '|' + arrow + '} {cmp|' + (diff < 0 ? 'Down ' : 'Up ') + amount + ' on ' + t.priorLabel + '}');
      }
    }
    if (t.target) lines.push('{cmp|' + t.target + '}');
    if (t.note) lines.push('{note|' + t.note + '}');
    // the number as large as the tile allows once its lines below have room (they're never clipped)
    const room = (h * 0.88 - lines.length * 20) / 1.25;
    const big = Math.max(18, Math.min(h * 0.32, w * 0.11, room));
    return {
      title: {
        text: '{big|' + (t.value == null ? 'No figure' : fmt(t.value, t.dp)) + '}' + (t.unit && t.value != null ? '{unit|' + (t.unit === '%' ? '' : ' ') + t.unit + '}' : '') +
          (lines.length ? '\n' + lines.join('\n') : ''),
        left: 'center', top: 'middle',
        textStyle: {
          rich: {
            big: { fontSize: big, fontWeight: 'bold', color: t.color || C.focus, lineHeight: big * 1.25 },
            unit: { fontSize: Math.max(13, big * 0.45), color: t.color || C.focus },
            cmp: { fontSize: 13, color: C.muted, lineHeight: 20 },
            note: { fontSize: 12, color: C.muted, lineHeight: 18 },
            good: { fontSize: 13, color: C.good }, bad: { fontSize: 13, color: C.bad },
          },
        },
      },
    };
  };

  // Sorted horizontal bars, largest at the top, one colour; labels give the value (and the share of the total).
  // b: { names, values, unit, dp, share, color, highlight: name shown in the focus colour (the rest in grey) }
  const sortedBars = (context, b) => {
    const rows = b.names.map((n, i) => ({ n, v: Number(b.values[i]) })).filter((r) => isFinite(r.v) && r.v > 0).sort((a, z) => a.v - z.v);
    const total = rows.reduce((s, r) => s + r.v, 0);
    const label = (v) => fmt(v, b.dp) + (b.unit ? (b.unit === '%' ? '%' : ' ' + b.unit) : '') + (b.share && total ? ' (' + fmt((v / total) * 100, 0) + '%)' : '');
    // room on the right for the longest value label (about 7.5 pixels a character at 13 pixels)
    const right = Math.max(60, Math.ceil(Math.max(0, ...rows.map((r) => label(r.v).length)) * 7.5) + 16);
    return {
      grid: { left: 24, right, top: 10, bottom: 10, containLabel: true },
      tooltip: { trigger: 'item', formatter: (p) => p.name + ': ' + label(p.value) },
      xAxis: { type: 'value', min: 0, axisLabel: { color: C.muted, formatter: (v) => short(v) + (b.unit === '%' ? '%' : '') }, splitLine: { lineStyle: { color: C.grid } } },
      yAxis: { type: 'category', data: rows.map((r) => r.n), axisLabel: { color: C.text, fontSize: 13 }, axisTick: { show: false } },
      series: [{
        type: 'bar', barMaxWidth: 28,
        data: rows.map((r) => ({ value: r.v, itemStyle: { color: b.highlight ? (r.n === b.highlight ? b.color || C.focus : C.context) : b.color || C.focus } })),
        label: { show: true, position: 'right', color: C.text, fontSize: 13, formatter: (p) => label(p.value) },
      }],
    };
  };

  // The 2019/20 renewable power agreement, marked on a chart of years
  const ppaMark = (label) => ({
    symbol: 'none', silent: true, lineStyle: { type: 'dashed', color: C.muted, width: 1 },
    label: { formatter: label || 'Renewable power agreement:\nelectricity counted as zero', color: C.muted, fontSize: 12, position: 'end', align: 'left', padding: [0, 0, 0, 6] },
    data: [{ xAxis: '2019/20' }],
  });

  // The council's own name, from the data model (the dashboard's hidden council variable, V406)
  const council = (context) => {
    const g = context && context.grafana;
    const v = g && g.replaceVariables ? g.replaceVariables('${council}') : '';
    return v && v !== '${council}' ? v : 'The council';
  };

  return { C, SOURCES, THEMES, SHADES, FUELS, STREAMS, STATUS, CATEGORICAL, fmt, short, sourceColour, describe, finish, col, first, times, size, tile, sortedBars, ppaMark, council };
})();
