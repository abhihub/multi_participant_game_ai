"""Canvas-based video HUD published as a LiveKit LocalVideoTrack.

The moderator renders scores, the current question, a speaking indicator,
confetti particles, and a winner banner onto a 640×480 canvas at 15 fps and
streams it as a real WebRTC video track that all participants can see.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from livekit import rtc

logger = logging.getLogger(__name__)

# Canvas dimensions
WIDTH = 640
HEIGHT = 480
FPS = 15

# Colour palette
BG_TOP = (15, 15, 35)
BG_BOTTOM = (25, 20, 50)
HEADER_BG = (40, 30, 80)
SCORE_ROW_EVEN = (35, 30, 65)
SCORE_ROW_ODD = (28, 24, 52)
SCORE_HIGHLIGHT = (80, 60, 160)
TEXT_PRIMARY = (240, 235, 255)
TEXT_SECONDARY = (180, 170, 210)
TEXT_ACCENT = (255, 215, 80)
SPEAKING_COLOR = (80, 200, 120)
WINNER_BG = (60, 40, 120)
WINNER_TEXT = (255, 215, 80)

CONFETTI_COLORS = [
    (255, 80, 80), (80, 200, 255), (255, 215, 80),
    (80, 255, 140), (255, 120, 200), (160, 100, 255),
    (255, 160, 60), (60, 220, 200),
]

# Character panel — right 160 px column
CHAR_PANEL_X = 480

# Anime character colour palette
CHAR_HAIR   = (160, 90, 220)   # purple
CHAR_SKIN   = (255, 218, 185)  # peach
CHAR_EYE    = (80, 120, 255)   # blue iris
CHAR_LASH   = (30, 20, 50)     # near-black lash
CHAR_LIP    = (220, 100, 120)  # pink lip
CHAR_OUTFIT = (70, 50, 130)    # dark purple


@dataclass
class _Particle:
    x: float
    y: float
    vx: float
    vy: float
    color: tuple[int, int, int]
    w: int
    h: int
    angle: float
    rot: float  # rotation speed rad/frame


class VideoRenderer:
    """Renders the game HUD and streams it as a LiveKit video track."""

    def __init__(self) -> None:
        self._source = rtc.VideoSource(WIDTH, HEIGHT)
        self._track = rtc.LocalVideoTrack.create_video_track("moderator-hud", self._source)

        # Render state (written from game flows, read from render loop)
        self._scores: list[tuple[str, int]] = []       # [(display_name, score), …] sorted desc
        self._question: str = ""
        self._speaking: bool = False
        self._winner_name: str | None = None
        self._particles: list[_Particle] = []
        self._winner_alpha: float = 0.0               # fade-in 0→1

        # Countdown animation state
        self._countdown_start: float | None = None

        # Correct answer celebration state
        self._correct_name: str | None = None
        self._correct_expires: float = 0.0
        self._correct_style: int = 0

        self._running = False
        self._task: asyncio.Task[None] | None = None

    # -- public API -------------------------------------------------------- #

    @property
    def track(self) -> rtc.LocalVideoTrack:
        return self._track

    async def start(self) -> None:
        self._running = True
        self._task = asyncio.create_task(self._render_loop())
        logger.info("video renderer started (%dx%d @ %d fps)", WIDTH, HEIGHT, FPS)

    async def stop(self) -> None:
        self._running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("video renderer stopped")

    def update_scores(self, scores: list[tuple[str, int]]) -> None:
        """Update the leaderboard. scores = [(display_name, score), …]."""
        self._scores = sorted(scores, key=lambda s: s[1], reverse=True)

    def set_question(self, text: str) -> None:
        self._question = text

    def set_speaking(self, speaking: bool) -> None:
        self._speaking = speaking

    def trigger_confetti(self) -> None:
        self._particles = [self._make_particle() for _ in range(120)]

    def show_winner(self, display_name: str) -> None:
        self._winner_name = display_name
        self._winner_alpha = 0.0

    async def show_countdown(self) -> None:
        """Display Ready→Set→GO over 1.5s, then return."""
        self._countdown_start = time.monotonic()
        await asyncio.sleep(1.5)

    def show_correct(self, display_name: str) -> None:
        """Flash a celebration overlay for ~2s and trigger confetti."""
        self._correct_name = display_name
        self._correct_expires = time.monotonic() + 2.0
        self._correct_style = random.randint(0, 2)
        self.trigger_confetti()

    # -- render loop ------------------------------------------------------- #

    async def _render_loop(self) -> None:
        interval = 1.0 / FPS
        while self._running:
            try:
                frame = self._render_frame()
                self._source.capture_frame(frame)
            except Exception:
                logger.debug("frame render error", exc_info=True)
            await asyncio.sleep(interval)

    def _render_frame(self) -> rtc.VideoFrame:
        img = self._draw()
        # PIL RGBA → raw bytes
        data = bytes(img.tobytes())
        return rtc.VideoFrame(
            width=WIDTH,
            height=HEIGHT,
            type=rtc.VideoBufferType.RGBA,
            data=data,
        )

    # -- drawing ----------------------------------------------------------- #

    def _draw(self) -> Image.Image:
        img = Image.new("RGBA", (WIDTH, HEIGHT))
        draw = ImageDraw.Draw(img, "RGBA")

        self._draw_background(draw)
        self._draw_header(draw)
        img = self._draw_character_panel(img)
        draw = ImageDraw.Draw(img, "RGBA")
        self._draw_leaderboard(draw)
        self._draw_question_banner(draw, img)
        self._draw_speaking_indicator(draw)
        self._tick_and_draw_confetti(draw)
        if self._winner_name:
            self._draw_winner_banner(draw)

        img = self._draw_countdown(img)
        img = self._draw_correct_celebration(img)

        return img

    def _draw_countdown(self, img: Image.Image) -> Image.Image:
        if self._countdown_start is None:
            return img
        elapsed = time.monotonic() - self._countdown_start
        if elapsed < 0.5:
            label, color = "Ready...", (255, 220, 50, 230)
        elif elapsed < 1.0:
            label, color = "Set...", (255, 140, 0, 230)
        elif elapsed < 1.5:
            label, color = "GO!", (80, 255, 120, 230)
        else:
            self._countdown_start = None
            return img

        font = _font(52)
        draw = ImageDraw.Draw(img, "RGBA")
        bbox = draw.textbbox((0, 0), label, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        cx, cy = WIDTH // 2, HEIGHT // 2
        pad = 18
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        odraw.rounded_rectangle(
            [cx - tw // 2 - pad, cy - th // 2 - pad, cx + tw // 2 + pad, cy + th // 2 + pad],
            radius=16, fill=(0, 0, 0, 180),
        )
        odraw.text((cx, cy), label, font=font, fill=color, anchor="mm")
        return Image.alpha_composite(img, overlay)

    def _draw_correct_celebration(self, img: Image.Image) -> Image.Image:
        if not self._correct_name:
            return img
        remaining = self._correct_expires - time.monotonic()
        if remaining <= 0:
            self._correct_name = None
            return img

        alpha = min(230, int(230 * min(1.0, remaining / 0.3)))
        headlines = [
            ("✓  CORRECT!", (80, 255, 120, alpha)),
            ("🎉  NICE ONE!  🎉", (255, 210, 50, alpha)),
            ("⭐  BRILLIANT!  ⭐", (130, 180, 255, alpha)),
        ]
        headline, color = headlines[self._correct_style]

        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        cy = HEIGHT // 2 - 20
        odraw.rounded_rectangle(
            [60, cy - 44, WIDTH - 60, cy + 54],
            radius=20, fill=(0, 0, 0, min(180, alpha)),
        )
        odraw.text((WIDTH // 2, cy), headline, font=_font(36), fill=color, anchor="mm")
        odraw.text(
            (WIDTH // 2, cy + 38), self._correct_name, font=_font(18),
            fill=(220, 220, 220, alpha), anchor="mm",
        )
        return Image.alpha_composite(img, overlay)

    def _draw_background(self, draw: ImageDraw.ImageDraw) -> None:
        for y in range(HEIGHT):
            t = y / HEIGHT
            r = int(BG_TOP[0] + t * (BG_BOTTOM[0] - BG_TOP[0]))
            g = int(BG_TOP[1] + t * (BG_BOTTOM[1] - BG_TOP[1]))
            b = int(BG_TOP[2] + t * (BG_BOTTOM[2] - BG_TOP[2]))
            draw.line([(0, y), (WIDTH, y)], fill=(r, g, b, 255))

    def _draw_header(self, draw: ImageDraw.ImageDraw) -> None:
        draw.rectangle([0, 0, WIDTH, 44], fill=(*HEADER_BG, 255))
        font = _font(18)
        draw.text((WIDTH // 2, 22), "🎮  AI Game Moderator", font=font,
                  fill=(*TEXT_ACCENT, 255), anchor="mm")

    def _draw_leaderboard(self, draw: ImageDraw.ImageDraw) -> None:
        right = CHAR_PANEL_X
        if not self._scores:
            font = _font(14)
            draw.text((right // 2, HEIGHT // 2), "Waiting for players…",
                      font=font, fill=(*TEXT_SECONDARY, 200), anchor="mm")
            return

        top = 54
        row_h = 38
        pad_x = 24
        font_name = _font(15)
        font_score = _font(17)
        medal = ["🥇", "🥈", "🥉"]

        for i, (name, score) in enumerate(self._scores[:8]):
            y0 = top + i * row_h
            y1 = y0 + row_h - 2
            bg = SCORE_HIGHLIGHT if i == 0 else (SCORE_ROW_EVEN if i % 2 == 0 else SCORE_ROW_ODD)
            draw.rectangle([pad_x, y0, right - pad_x, y1], fill=(*bg, 255))

            prefix = medal[i] if i < 3 else f"{i + 1}."
            label = f"{prefix}  {name}"
            draw.text((pad_x + 10, y0 + row_h // 2), label,
                      font=font_name, fill=(*TEXT_PRIMARY, 255), anchor="lm")

            score_text = str(score)
            draw.text((right - pad_x - 10, y0 + row_h // 2), score_text,
                      font=font_score, fill=(*TEXT_ACCENT, 255), anchor="rm")

    def _draw_character_panel(self, img: Image.Image) -> Image.Image:
        draw = ImageDraw.Draw(img, "RGBA")

        # Vertical separator
        draw.line(
            [(CHAR_PANEL_X, 44), (CHAR_PANEL_X, HEIGHT - 56)],
            fill=(100, 80, 160, 180), width=2,
        )

        t = time.monotonic()
        celebrating = t < self._correct_expires
        bob_y = int(math.sin(t * 6.0) * 8) if celebrating else int(math.sin(t * 1.8) * 4)
        cx = (CHAR_PANEL_X + WIDTH) // 2   # 560
        cy = 44 + (HEIGHT - 56 - 44) // 2 + bob_y  # ~234 + bob

        self._draw_anime_face(draw, cx, cy, celebrating)

        # Blush — semi-transparent via alpha_composite
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        odraw = ImageDraw.Draw(overlay)
        odraw.ellipse([cx - 36, cy + 2, cx - 20, cy + 12], fill=(255, 140, 140, 100))
        odraw.ellipse([cx + 20, cy + 2, cx + 36, cy + 12], fill=(255, 140, 140, 100))
        return Image.alpha_composite(img, overlay)

    def _draw_anime_face(self, draw: ImageDraw.ImageDraw, cx: int, cy: int, celebrating: bool) -> None:
        t = time.monotonic()

        # --- Hair mass (behind face) ---
        draw.ellipse([cx - 42, cy - 75, cx + 42, cy - 22], fill=(*CHAR_HAIR, 255))

        # Side hair strands
        draw.ellipse([cx - 54, cy - 55, cx - 28, cy + 10], fill=(*CHAR_HAIR, 255))
        draw.ellipse([cx + 28, cy - 55, cx + 54, cy + 10], fill=(*CHAR_HAIR, 255))

        # Ahoge spike (narrow upward triangle)
        draw.polygon(
            [(cx, cy - 115), (cx - 6, cy - 80), (cx + 6, cy - 80)],
            fill=(*CHAR_HAIR, 255),
        )

        # Ears
        draw.ellipse([cx - 42, cy - 15, cx - 32, cy + 5], fill=(*CHAR_SKIN, 255))
        draw.ellipse([cx + 32, cy - 15, cx + 42, cy + 5], fill=(*CHAR_SKIN, 255))

        # Face
        draw.ellipse([cx - 36, cy - 45, cx + 36, cy + 35], fill=(*CHAR_SKIN, 255))

        # Front bangs (3 overlapping ellipses over top of face)
        draw.ellipse([cx - 38, cy - 55, cx - 10, cy - 28], fill=(*CHAR_HAIR, 255))
        draw.ellipse([cx - 18, cy - 60, cx + 18, cy - 30], fill=(*CHAR_HAIR, 255))
        draw.ellipse([cx + 10, cy - 55, cx + 38, cy - 28], fill=(*CHAR_HAIR, 255))

        if celebrating:
            # Happy ^^ eyes — two arc lines
            draw.arc([cx - 28, cy - 28, cx - 10, cy - 14], start=200, end=340, fill=(*CHAR_LASH, 255), width=3)
            draw.arc([cx + 10, cy - 28, cx + 28, cy - 14], start=200, end=340, fill=(*CHAR_LASH, 255), width=3)

            # Sparkle lines around eyes
            for dx, ey in [(cx - 19, cy - 30), (cx + 19, cy - 30)]:
                draw.line([(dx, ey - 6), (dx, ey - 10)], fill=(*TEXT_ACCENT, 220), width=2)
                draw.line([(dx - 5, ey - 3), (dx - 8, ey - 5)], fill=(*TEXT_ACCENT, 180), width=1)
                draw.line([(dx + 5, ey - 3), (dx + 8, ey - 5)], fill=(*TEXT_ACCENT, 180), width=1)
        else:
            # Normal open eyes — white → iris → pupil → highlight
            for ex in [cx - 19, cx + 19]:
                draw.ellipse([ex - 9, cy - 28, ex + 9, cy - 12], fill=(255, 255, 255, 255))
                draw.ellipse([ex - 6, cy - 26, ex + 6, cy - 14], fill=(*CHAR_EYE, 255))
                draw.ellipse([ex - 3, cy - 24, ex + 3, cy - 16], fill=(10, 10, 30, 255))
                draw.ellipse([ex + 2, cy - 24, ex + 5, cy - 21], fill=(255, 255, 255, 220))
                # Lash arc over eye
                draw.arc([ex - 10, cy - 30, ex + 10, cy - 14], start=200, end=340, fill=(*CHAR_LASH, 255), width=2)

        # Nose — single dot
        draw.ellipse([cx - 2, cy + 10, cx + 2, cy + 14], fill=(220, 170, 140, 255))

        # Mouth
        if celebrating:
            # Wide happy arc + filled inner ellipse
            draw.arc([cx - 18, cy + 14, cx + 18, cy + 28], start=0, end=180, fill=(*CHAR_LIP, 255), width=3)
            draw.ellipse([cx - 12, cy + 16, cx + 12, cy + 26], fill=(180, 60, 80, 200))
        elif self._speaking:
            mouth_h = int(abs(math.sin(t * 8)) * 10 + 3)
            draw.ellipse([cx - 10, cy + 16, cx + 10, cy + 16 + mouth_h], fill=(*CHAR_LIP, 255))
        else:
            # Gentle idle smile
            draw.arc([cx - 14, cy + 14, cx + 14, cy + 26], start=0, end=180, fill=(*CHAR_LIP, 255), width=2)

        # Neck
        draw.rectangle([cx - 10, cy + 34, cx + 10, cy + 50], fill=(*CHAR_SKIN, 255))

        # Body / outfit (trapezoid)
        draw.polygon(
            [(cx - 30, cy + 50), (cx + 30, cy + 50), (cx + 42, cy + 95), (cx - 42, cy + 95)],
            fill=(*CHAR_OUTFIT, 255),
        )
        # Light collar
        draw.polygon(
            [(cx - 10, cy + 50), (cx + 10, cy + 50), (cx + 16, cy + 65), (cx - 16, cy + 65)],
            fill=(200, 180, 240, 220),
        )

    def _draw_question_banner(self, draw: ImageDraw.ImageDraw, img: Image.Image) -> None:
        if not self._question:
            return
        banner_h = 56
        y0 = HEIGHT - banner_h
        draw.rectangle([0, y0, WIDTH, HEIGHT], fill=(20, 15, 45, 230))
        font = _font(13)
        # Word-wrap to ~72 chars
        words = self._question.split()
        lines: list[str] = []
        cur = ""
        for w in words:
            if len(cur) + len(w) + 1 > 72:
                lines.append(cur.rstrip())
                cur = w + " "
            else:
                cur += w + " "
        if cur.strip():
            lines.append(cur.rstrip())
        lines = lines[:2]
        total = len(lines) * 18
        start_y = y0 + (banner_h - total) // 2 + 9
        for line in lines:
            draw.text((WIDTH // 2, start_y), line, font=font,
                      fill=(*TEXT_PRIMARY, 255), anchor="mm")
            start_y += 18

    def _draw_speaking_indicator(self, draw: ImageDraw.ImageDraw) -> None:
        if not self._speaking:
            return
        cx, cy, r = WIDTH - 22, 22, 8
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(*SPEAKING_COLOR, 255))
        font = _font(11)
        draw.text((cx - r - 4, cy), "🎙", font=font, fill=(*TEXT_PRIMARY, 200), anchor="rm")

    def _tick_and_draw_confetti(self, draw: ImageDraw.ImageDraw) -> None:
        alive: list[_Particle] = []
        for p in self._particles:
            p.x += p.vx
            p.vy += 0.18          # gravity
            p.y += p.vy
            p.angle += p.rot
            if p.y < HEIGHT + 20:
                alive.append(p)
                # Draw as rotated rectangle approximation (4 corner points)
                cx, cy = p.x, p.y
                hw, hh = p.w / 2, p.h / 2
                cos_a, sin_a = math.cos(p.angle), math.sin(p.angle)
                corners = [
                    (cx + cos_a * (-hw) - sin_a * (-hh),
                     cy + sin_a * (-hw) + cos_a * (-hh)),
                    (cx + cos_a * hw - sin_a * (-hh),
                     cy + sin_a * hw + cos_a * (-hh)),
                    (cx + cos_a * hw - sin_a * hh,
                     cy + sin_a * hw + cos_a * hh),
                    (cx + cos_a * (-hw) - sin_a * hh,
                     cy + sin_a * (-hw) + cos_a * hh),
                ]
                draw.polygon(corners, fill=(*p.color, 210))
        self._particles = alive

    def _draw_winner_banner(self, draw: ImageDraw.ImageDraw) -> None:
        self._winner_alpha = min(1.0, self._winner_alpha + 0.06)
        alpha = int(self._winner_alpha * 220)
        cy = HEIGHT // 2 - 20
        draw.rectangle([60, cy - 44, WIDTH - 60, cy + 54], fill=(*WINNER_BG, alpha))
        font_big = _font(26)
        font_sm = _font(15)
        draw.text((WIDTH // 2, cy - 18), "🏆  WINNER!", font=font_big,
                  fill=(*WINNER_TEXT, alpha), anchor="mm")
        draw.text((WIDTH // 2, cy + 26), self._winner_name or "", font=font_sm,
                  fill=(*TEXT_PRIMARY, alpha), anchor="mm")

    # -- helpers ----------------------------------------------------------- #

    @staticmethod
    def _make_particle() -> _Particle:
        return _Particle(
            x=random.uniform(0, WIDTH),
            y=random.uniform(-20, 0),
            vx=random.uniform(-1.5, 1.5),
            vy=random.uniform(1.0, 4.0),
            color=random.choice(CONFETTI_COLORS),
            w=random.randint(6, 12),
            h=random.randint(4, 8),
            angle=random.uniform(0, math.tau),
            rot=random.uniform(-0.15, 0.15),
        )


# Module-level font cache (Pillow default font, no file needed)
_font_cache: dict[int, ImageFont.ImageFont] = {}


def _font(size: int) -> ImageFont.ImageFont:
    if size not in _font_cache:
        try:
            _font_cache[size] = ImageFont.load_default(size=size)
        except TypeError:
            # Pillow < 10 fallback
            _font_cache[size] = ImageFont.load_default()
    return _font_cache[size]
