from flask import Flask, request, send_from_directory, make_response
import subprocess
import threading
import re

app = Flask(__name__)

PORT = 8000


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def serve_file(path):
    return send_from_directory('.', path)


# Middleware anti-cache
@app.after_request
def add_no_cache_headers(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response


def start_cloudflare_tunnel():
    """Menjalankan Cloudflare Tunnel dan menampilkan URL online."""

    process = subprocess.Popen(
        [
            'cloudflared',
            'tunnel',
            '--url',
            f'http://127.0.0.1:{PORT}'
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    for line in process.stdout:
        line = line.strip()

        # Cari URL trycloudflare.com
        match = re.search(
            r'https://[a-zA-Z0-9-]+\.trycloudflare\.com',
            line
        )

        if match:
            print()
            print("=" * 60)
            print("🌐 SERVER ONLINE")
            print("=" * 60)
            print(f"Local  : http://127.0.0.1:{PORT}")
            print(f"Online : {match.group(0)}")
            print("=" * 60)
            print()


if __name__ == '__main__':

    # Jalankan Cloudflare Tunnel di background
    tunnel_thread = threading.Thread(
        target=start_cloudflare_tunnel,
        daemon=True
    )
    tunnel_thread.start()

    print("=" * 60)
    print("🚀 Memulai Flask Server...")
    print("=" * 60)
    print(f"Local : http://127.0.0.1:{PORT}")
    print("Tunnel: menghubungkan...")
    print()

    # Flask
    app.run(
        host='127.0.0.1',
        port=PORT,
        debug=False
    )