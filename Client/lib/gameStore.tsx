"use client";
import React, { createContext, useContext, useReducer, useCallback } from "react";
import type {
  GameEventEnvelope,
  EvScoreUpdated,
  EvGameWinner,
  EvSessionEnded,
  EvFloorChanged,
  EvTriviaQuestion,
  EvQuickDrawPrompt,
  EvEffectTriggered,
  FinalScore,
} from "./events";

export interface GameState {
  status: "lobby" | "running" | "paused" | "ended";
  floor: { mode: "open" | "moderator_only" | "roles_only" };
  scores: Record<string, number>;
  currentQuestion: string | null;
  currentPrompt: string | null;
  winner: {
    identity: string;
    displayName: string | null;
    finalScores: FinalScore[];
  } | null;
  isSpeaking: boolean;
  showConfetti: boolean;
  eventLog: Array<{ type: string; payload: unknown; seq: number }>;
}

const initialState: GameState = {
  status: "lobby",
  floor: { mode: "open" },
  scores: {},
  currentQuestion: null,
  currentPrompt: null,
  winner: null,
  isSpeaking: false,
  showConfetti: false,
  eventLog: [],
};

type Action =
  | { type: "DISPATCH_EVENT"; event: GameEventEnvelope }
  | { type: "CLEAR_CONFETTI" };

function reducer(state: GameState, action: Action): GameState {
  if (action.type === "CLEAR_CONFETTI") {
    return { ...state, showConfetti: false };
  }

  if (action.type !== "DISPATCH_EVENT") return state;

  const { type, payload, seq } = action.event;
  const newLog = [...state.eventLog, { type, payload, seq }].slice(-100);

  switch (type) {
    case "session.started":
      return { ...state, status: "running", eventLog: newLog };

    case "session.paused":
      return { ...state, status: "paused", eventLog: newLog };

    case "session.resumed":
      return { ...state, status: "running", eventLog: newLog };

    case "session.ended": {
      const ev = payload as unknown as EvSessionEnded;
      return {
        ...state,
        status: "ended",
        winner: ev.winner_identity
          ? {
              identity: ev.winner_identity,
              displayName: null,
              finalScores: ev.final_scores ?? [],
            }
          : state.winner,
        eventLog: newLog,
      };
    }

    case "score.updated": {
      const ev = payload as unknown as EvScoreUpdated;
      return {
        ...state,
        scores: { ...state.scores, [ev.participant_identity]: ev.score },
        eventLog: newLog,
      };
    }

    case "floor.changed": {
      const ev = payload as unknown as EvFloorChanged;
      return { ...state, floor: ev.floor, eventLog: newLog };
    }

    case "trivia.question": {
      const ev = payload as unknown as EvTriviaQuestion;
      return {
        ...state,
        currentQuestion: ev.prompt,
        currentPrompt: null,
        eventLog: newLog,
      };
    }

    case "quickdraw.prompt": {
      const ev = payload as unknown as EvQuickDrawPrompt;
      return {
        ...state,
        currentPrompt: ev.prompt,
        currentQuestion: null,
        eventLog: newLog,
      };
    }

    case "round.ended":
      return {
        ...state,
        currentQuestion: null,
        currentPrompt: null,
        eventLog: newLog,
      };

    case "game.winner": {
      const ev = payload as unknown as EvGameWinner;
      return {
        ...state,
        winner: {
          identity: ev.winner_identity,
          displayName: ev.winner_display_name ?? null,
          finalScores: ev.final_scores,
        },
        showConfetti: true,
        eventLog: newLog,
      };
    }

    case "effect.triggered": {
      const ev = payload as unknown as EvEffectTriggered;
      if (ev.effect === "confetti") {
        return { ...state, showConfetti: true, eventLog: newLog };
      }
      return { ...state, eventLog: newLog };
    }

    case "moderator.speak.started":
      return { ...state, isSpeaking: true, eventLog: newLog };

    case "moderator.speak.ended":
      return { ...state, isSpeaking: false, eventLog: newLog };

    default:
      return { ...state, eventLog: newLog };
  }
}

interface GameContextValue {
  state: GameState;
  handleEvent: (event: GameEventEnvelope) => void;
  clearConfetti: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const handleEvent = useCallback((event: GameEventEnvelope) => {
    dispatch({ type: "DISPATCH_EVENT", event });
  }, []);

  const clearConfetti = useCallback(() => {
    dispatch({ type: "CLEAR_CONFETTI" });
  }, []);

  return (
    <GameContext.Provider value={{ state, handleEvent, clearConfetti }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error("useGame must be used inside <GameProvider>");
  return ctx;
}
