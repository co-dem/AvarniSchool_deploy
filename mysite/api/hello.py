# mysite/api/hello.py
def app(environ, start_response):
    """Простой WSGI обработчик без Django"""
    status = '200 OK'
    headers = [('Content-type', 'text/plain')]
    start_response(status, headers)
    return [b'Hello from Vercel without Django!']