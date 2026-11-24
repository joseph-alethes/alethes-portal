import json, sys
from playwright.sync_api import sync_playwright
T = json.load(open('test/tokens.json'))
out = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for who in ['harbor', 'whitlock', 'staff']:
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}, extra_http_headers={'cf-access-jwt-assertion': T[who]})
        pg = ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('http://127.0.0.1:8787/'); pg.wait_for_timeout(1500)
        text = pg.inner_text('body')
        nav = pg.eval_on_selector_all('nav a, [data-view]', 'els => els.filter(e => e.offsetParent !== null).map(e => e.textContent.trim())')
        out[who] = {'errors': errs, 'email': pg.inner_text('#email'), 'nav': nav, 'hasHarbor': 'Harbor' in text, 'hasWhitlock': 'Whitlock' in text, 'head': text[:300]}
        pg.screenshot(path=f'/tmp/ui_{who}.png')
        if who == 'staff':
            pg.goto('http://127.0.0.1:8787/#review'); pg.wait_for_timeout(1200)
            pg.screenshot(path='/tmp/ui_staff_review.png', full_page=True)
            out['staff_review'] = pg.inner_text('main')[:600]
        if who == 'harbor':
            pg.goto('http://127.0.0.1:8787/#classifications'); pg.wait_for_timeout(1200)
            pg.screenshot(path='/tmp/ui_harbor_cls.png')
            out['harbor_cls_errors'] = list(errs)
        ctx.close()
    b.close()
print(json.dumps(out, indent=1))
