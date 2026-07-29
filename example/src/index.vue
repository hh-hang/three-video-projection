<template>
    <div class="home">
        <a class="github-link" href="https://github.com/hh-hang/vid3d-projection" target="_blank" title="GitHub">
            <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                    d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577
                    0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755
                    -1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998
                    .108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22
                    -.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405
                    1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176
                    .765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22
                    0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297
                    c0-6.627-5.373-12-12-12"
                />
            </svg>
        </a>
        <header class="header">
            <h1 class="title">vid3d-projection</h1>
            <p class="subtitle">
                Video texture projection for Three.js and Cesium.js 3D scenes
            </p>
        </header>
        <main class="examples">
            <a class="card" href="./three-monitor.html">
                <div class="badge badge-three">Three.js</div>
                <div class="card-image">
                    <img src="/imgs/2.gif" alt="Monitor" />
                </div>
                <div class="card-info">
                    <h2>Monitor</h2>
                    <p>Three.js surveillance video projection demo</p>
                    <span class="card-arrow">→</span>
                </div>
            </a>
            <a class="card" href="./cesium-monitor.html">
                <div class="badge badge-cesium">Cesium.js</div>
                <div class="card-image">
                    <img src="/imgs/3.gif" alt="Cesium" />
                </div>
                <div class="card-info">
                    <h2>Monitor</h2>
                    <p>Cesium surveillance video projection demo</p>
                    <span class="card-arrow">→</span>
                </div>
            </a>
            <a class="card" href="./three-cinema.html">
                <div class="badge badge-three">Three.js</div>
                <div class="card-image">
                    <img src="/imgs/1.gif" alt="Cinema" />
                </div>
                <div class="card-info">
                    <h2>Cinema</h2>
                    <p>Cinema scene video projection demo</p>
                    <span class="card-arrow">→</span>
                </div>
            </a>
 
        </main>
    </div>
</template>

<style scoped>
.github-link {
    position: fixed;
    top: 1.2rem;
    right: 1.4rem;
    color: #aaa;
    transition: color 0.15s;
    z-index: 10;
}

.github-link:hover {
    color: #fff;
}

.github-link svg {
    width: 28px;
    height: 28px;
    display: block;
}

.home {
    width: 100vw;
    min-height: 100vh;
    background: #0d0d0d;
    color: #fff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 48px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 40px 0;
    box-sizing: border-box;
}

.header {
    text-align: center;
}

.title {
    font-size: 2.4rem;
    font-weight: 700;
    margin: 0 0 10px;
    letter-spacing: 0.02em;
    background: linear-gradient(135deg, #fff 40%, #888);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
}

.subtitle {
    margin: 0;
    color: #666;
    font-size: 0.95rem;
}

.examples {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 0 16px;
}

.card {
    display: flex;
    flex-direction: column;
    width: 480px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    text-decoration: none;
    color: #fff;
    overflow: hidden;
    transition:
        border-color 0.2s,
        background 0.2s;
    position: relative;
}

.card:hover {
    background: #222;
    border-color: #444;
}

.badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    padding: 6px 14px;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    z-index: 10;
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: #aaa;
}

.badge-three {
    color: #00aaff;
    border-color: rgba(0, 170, 255, 0.3);
}

.badge-cesium {
    color: #ff9900;
    border-color: rgba(255, 153, 0, 0.3);
}

.card-image {
    width: 100%;
    height: 300px;
    overflow: hidden;
    background: #111;
}

.card-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.card-info {
    padding: 20px 24px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.card-info h2 {
    margin: 0 0 4px;
    font-size: 1.1rem;
    font-weight: 600;
}

.card-info p {
    margin: 0;
    font-size: 0.82rem;
    color: #666;
}

.card-arrow {
    margin-left: auto;
    font-size: 1.2rem;
    color: #444;
    transition:
        color 0.2s,
        transform 0.2s;
}

.card:hover .card-arrow {
    color: #aaa;
    transform: translateX(4px);
}

@media (max-width: 600px) {
    .home {
        gap: 32px;
        justify-content: flex-start;
        padding: 40px 0;
    }

    .title {
        font-size: 1.6rem;
    }

    .card {
        width: 100%;
    }

    .card-image {
        height: 200px;
    }
}
</style>
