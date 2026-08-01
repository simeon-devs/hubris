"""Multi-agent workforce (BUILD_SPEC §5.1 / ARCHITECTURE.md §3 module 5): a
LangGraph graph routes a planner's question to the specialist best suited
to answer it — Network Analyst, Scenario Strategist, Optimizer, Cost
Analyst, or Risk/Devil's Advocate — then runs that specialist (T-11's
`run_agent_query`) with its own role-specific system prompt and a
restricted tool subset. The router only decides WHICH real question to
route; every specialist's actual numbers still come from tool calls, never
the router or the specialist's own head.
"""

from typing import Callable, TypedDict

from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph

from hubris.agents.runner import NO_FABRICATION_SYSTEM_PROMPT, run_agent_query
from hubris.core.contracts import NetworkModel
from hubris.core.registry import AGENT_TOOL
from hubris.core.registry import registry as global_registry

ROLE_TOOLS: dict[str, set[str]] = {
    "network_analyst": {"get_kpis", "find_spare_capacity"},
    "scenario_strategist": {"simulate_scenario", "compare_scenarios"},
    "optimizer": {"optimise_network"},
    "cost_analyst": {"get_kpis"},
    # T-20: robustness/stress-test questions need optimise_network's Monte
    # Carlo band (holds_under_variation, feasible_pct) — the only tool that
    # actually computes robustness, not just before/after point estimates.
    "risk_analyst": {"simulate_scenario", "compare_scenarios", "get_kpis", "optimise_network"},
}

ROLE_GOALS: dict[str, str] = {
    "network_analyst": (
        "Network Analyst. Read the current network state and identify "
        "bottlenecks, spare capacity, and utilization issues."
    ),
    "scenario_strategist": (
        "Scenario Strategist. Propose and evaluate what-if scenarios "
        "(moving/closing/adding hubs, fleet mix, demand changes) for the planner."
    ),
    "optimizer": (
        "Optimizer. Run the network optimiser to find the best hub "
        "open/close configuration and explain the recommendation."
    ),
    "cost_analyst": (
        "Cost Analyst. Decompose cost-to-serve into transport and fixed cost "
        "components and explain what's driving cost."
    ),
    "risk_analyst": (
        "Risk Analyst (Devil's Advocate). Stress-test recommendations and "
        "the current plan against demand growth (e.g. +30%) and report "
        "where they would break."
    ),
}

DEFAULT_ROLE = "network_analyst"

ROUTER_PROMPT = """Classify the planner's question into exactly one specialist role. Reply with ONLY the role name below, nothing else.

Roles:
- network_analyst: current state, bottlenecks, spare capacity, utilization questions
- scenario_strategist: what-if questions (move/close/add a hub, change fleet, change demand) and comparisons
- optimizer: "should we change the network", hub open/close recommendations, cost minimization
- cost_analyst: cost-to-serve breakdown, what's driving cost
- risk_analyst: stress-testing, "what if demand grows", robustness, worst-case questions

Question: {question}

Role:"""

Classifier = Callable[[str], str]


def _llm_classify(question: str) -> str:
    llm = ChatAnthropic(model="claude-haiku-4-5-20251001", max_tokens=20)
    response = llm.invoke(ROUTER_PROMPT.format(question=question))
    return str(response.content).strip().lower()


class WorkforceState(TypedDict):
    question: str
    role: str
    answer: str
    tool_calls: list[dict]


def _route_node(classifier: Classifier):
    def _node(state: WorkforceState) -> WorkforceState:
        role = classifier(state["question"])
        if role not in ROLE_TOOLS:
            role = DEFAULT_ROLE
        return {**state, "role": role}

    return _node


def _specialist_node(role: str, model: NetworkModel):
    def _node(state: WorkforceState) -> WorkforceState:
        tool_names = ROLE_TOOLS[role]
        tools = [t for t in global_registry.all(AGENT_TOOL) if t.name in tool_names]
        system_prompt = f"{NO_FABRICATION_SYSTEM_PROMPT}\n\nYour role: {ROLE_GOALS[role]}"
        result = run_agent_query(model, tools, state["question"], system_prompt=system_prompt)
        return {**state, "answer": result["answer"], "tool_calls": result["tool_calls"]}

    return _node


def build_workforce_graph(model: NetworkModel, classifier: Classifier | None = None):
    graph = StateGraph(WorkforceState)
    graph.add_node("route", _route_node(classifier or _llm_classify))
    for role in ROLE_TOOLS:
        graph.add_node(role, _specialist_node(role, model))

    graph.set_entry_point("route")
    graph.add_conditional_edges("route", lambda state: state["role"], {r: r for r in ROLE_TOOLS})
    for role in ROLE_TOOLS:
        graph.add_edge(role, END)

    return graph.compile()


def run_workforce_query(
    model: NetworkModel, question: str, classifier: Classifier | None = None
) -> dict:
    graph = build_workforce_graph(model, classifier)
    result = graph.invoke({"question": question, "role": "", "answer": "", "tool_calls": []})
    return {
        "role": result["role"],
        "answer": result["answer"],
        "tool_calls": result["tool_calls"],
    }
