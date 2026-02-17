"""Behavioral tests — prompt quality with real LLM (requires OPENAI_API_KEY)."""

from __future__ import annotations

import json

import pytest

pytestmark = pytest.mark.behavioral

from livekit.agents import Agent, AgentSession
from livekit.agents.voice.run_result import ChatMessageEvent

from moderator.prompts import (
    TRIVIA_MODERATOR,
    TRIVIA_QUESTION_GENERATOR,
    TRIVIA_ANSWER_JUDGE,
    QUICKDRAW_MODERATOR,
)


@pytest.fixture
def llm_model():
    return "openai/gpt-4.1-mini"


async def _run_agent_text(instructions: str, user_input: str, llm_model: str) -> str:
    """Run an agent in test mode and return its text response."""
    agent = Agent(instructions=instructions)
    session = AgentSession(llm=llm_model)
    session.start(agent)
    result = session.run(user_input=user_input)
    await result

    # Extract assistant message text from events
    texts: list[str] = []
    for event in result.events:
        if isinstance(event, ChatMessageEvent):
            item = event.item
            if item.role == "assistant":
                # ChatMessage content can be str or list
                if isinstance(item.content, str):
                    texts.append(item.content)
                elif isinstance(item.content, list):
                    for part in item.content:
                        if isinstance(part, str):
                            texts.append(part)
                        elif hasattr(part, "text"):
                            texts.append(part.text)

    return " ".join(texts)


@pytest.mark.timeout(30)
async def test_trivia_host_greeting(llm_model):
    response = await _run_agent_text(
        instructions=TRIVIA_MODERATOR,
        user_input="Hey, excited to play!",
        llm_model=llm_model,
    )

    assert len(response) > 10
    lower = response.lower()
    assert any(
        word in lower
        for word in ["welcome", "trivia", "quiz", "play", "let's", "ready", "excited", "hello", "hi", "hey"]
    )


@pytest.mark.timeout(30)
async def test_trivia_question_generation(llm_model):
    prompt = TRIVIA_QUESTION_GENERATOR.format(topic="Science", difficulty="easy")
    response = await _run_agent_text(
        instructions="You are a trivia question generator. Respond only with valid JSON.",
        user_input=prompt,
        llm_model=llm_model,
    )

    # Strip markdown code fences if present
    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    data = json.loads(text)
    assert "question" in data
    assert "answer" in data


@pytest.mark.timeout(30)
async def test_trivia_answer_judging_correct(llm_model):
    prompt = TRIVIA_ANSWER_JUDGE.format(
        question="What is the capital of France?",
        expected_answer="Paris",
        accept_also="paris",
        transcript="paris",
    )
    response = await _run_agent_text(
        instructions="You are a trivia answer judge. Respond only with valid JSON.",
        user_input=prompt,
        llm_model=llm_model,
    )

    text = response.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    data = json.loads(text)
    assert data["is_correct"] is True


@pytest.mark.timeout(30)
async def test_quickdraw_host_greeting(llm_model):
    response = await _run_agent_text(
        instructions=QUICKDRAW_MODERATOR,
        user_input="Hi! Ready to draw!",
        llm_model=llm_model,
    )

    assert len(response) > 10
    lower = response.lower()
    assert any(
        word in lower
        for word in ["draw", "sketch", "welcome", "ready", "let's", "excited"]
    )
