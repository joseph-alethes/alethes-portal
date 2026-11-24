import json
from playwright.sync_api import sync_playwright
T = json.load(open('test/tokens.json'))
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for who, hash_ in [('harbor', 'classifications'), ('staff', 'review')]:
        ctx = b.new_context(viewport={'width': 1280, 'height': 900}, extra_http_headers={'cf-access-jwt-assertion': T[who]})
        pg = ctx.new_page(); pg.goto('http://127.0.0.1:8787/#' + hash_); pg.wait_for_timeout(1500)
        print(who, pg.evaluate("[...document.querySelectorAll('.scroll')].filter(e=>e.offsetParent).map(e=>[e.querySelector('table')?.id, e.scrollWidth, e.clientWidth])"))
        pg.screenshot(path=f'/tmp/w_{who}.png')
    b.close()
