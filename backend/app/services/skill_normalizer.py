"""
Semantic Skill Intelligence & Normalization Service.

Provides:
- Exact canonical skill normalization rules with strict boundary isolation
  (e.g., ReactJS -> React, JS -> JavaScript, K8s -> Kubernetes, Postgres -> PostgreSQL,
   while strictly keeping Java != JavaScript and C != C++).
- Context-sensitive resolution (e.g., 'Py' -> 'Python' only when context supports it).
- Semantic classification into:
  * Core skills (primary technical stack defining candidate's engineering capacity)
  * Supporting skills (tooling, styling, auxiliary libraries)
  * Missing skills (in-demand industry skills standard for the candidate's core cluster)
  * Related skills (logical adjacent skills candidate could transition into)
  * Outdated skills (legacy technologies that should be modernized)
  * Skills requiring assessment (skills mapped to approved 5Q / 10Q placement tests)
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Set, Tuple
from app.schemas.resume_ai import SemanticSkillClassification


# Strict canonical mappings for aliases and synonyms
CANONICAL_SYNONYMS: Dict[str, str] = {
    # Frontend
    "react": "React",
    "reactjs": "React",
    "react.js": "React",
    "react 18": "React",
    "react 19": "React",
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "javascript": "JavaScript",
    "js": "JavaScript",
    "vanilla js": "JavaScript",
    "ecmascript": "JavaScript",
    "es6": "JavaScript",
    "next.js": "Next.js",
    "nextjs": "Next.js",
    "tailwind": "Tailwind CSS",
    "tailwindcss": "Tailwind CSS",
    "tailwind css": "Tailwind CSS",
    "redux": "Redux",
    "redux toolkit": "Redux",
    "rtk": "Redux",
    "vue": "Vue.js",
    "vue.js": "Vue.js",
    "vuejs": "Vue.js",
    "angular": "Angular",
    "angularjs": "Angular",
    "html": "HTML/CSS",
    "html5": "HTML/CSS",
    "css": "HTML/CSS",
    "css3": "HTML/CSS",
    "sass": "HTML/CSS",
    "scss": "HTML/CSS",
    "graphql": "GraphQL",
    # Backend
    "python": "Python",
    "python3": "Python",
    "fastapi": "FastAPI",
    "node": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "node js": "Node.js",
    "express": "Express.js",
    "express.js": "Express.js",
    "expressjs": "Express.js",
    "django": "Django",
    "drf": "Django",
    "django rest framework": "Django",
    "flask": "Flask",
    "java": "Java",
    "core java": "Java",
    "jdk": "Java",
    "spring boot": "Spring Boot",
    "springboot": "Spring Boot",
    "spring framework": "Spring Boot",
    "go": "Go",
    "golang": "Go",
    "c++": "C++",
    "cpp": "C++",
    "c#": "C#",
    "csharp": "C#",
    ".net": "C#",
    "asp.net": "C#",
    "rest api": "REST APIs",
    "restful": "REST APIs",
    "rest apis": "REST APIs",
    "restful api": "REST APIs",
    "microservices": "Microservices",
    # Databases
    "mongodb": "MongoDB",
    "mongo": "MongoDB",
    "mongoose": "MongoDB",
    "atlas": "MongoDB",
    "postgresql": "PostgreSQL",
    "postgres": "PostgreSQL",
    "psql": "PostgreSQL",
    "mysql": "MySQL",
    "sql": "SQL",
    "rdbms": "SQL",
    "redis": "Redis",
    "firebase": "Firebase",
    "firestore": "Firebase",
    "sqlite": "SQLite",
    "elasticsearch": "Elasticsearch",
    # Cloud & DevOps
    "docker": "Docker",
    "dockerfile": "Docker",
    "docker compose": "Docker",
    "kubernetes": "Kubernetes",
    "k8s": "Kubernetes",
    "aws": "AWS",
    "amazon web services": "AWS",
    "azure": "Azure",
    "microsoft azure": "Azure",
    "gcp": "GCP",
    "google cloud": "GCP",
    "ci/cd": "CI/CD",
    "github actions": "CI/CD",
    "jenkins": "CI/CD",
    "git": "Git",
    "github": "Git",
    "gitlab": "Git",
    "linux": "Linux",
    "ubuntu": "Linux",
    "bash": "Linux",
    "terraform": "Terraform",
    # AI & ML
    "machine learning": "Machine Learning",
    "ml": "Machine Learning",
    "deep learning": "Deep Learning",
    "neural networks": "Deep Learning",
    "pytorch": "PyTorch",
    "tensorflow": "TensorFlow",
    "keras": "TensorFlow",
    "scikit-learn": "Scikit-learn",
    "sklearn": "Scikit-learn",
    "pandas": "Pandas",
    "numpy": "NumPy",
    "nlp": "NLP",
    "natural language processing": "NLP",
    "llm": "LLM / GenAI",
    "genai": "LLM / GenAI",
    "generative ai": "LLM / GenAI",
    "rag": "LLM / GenAI",
    "langchain": "LLM / GenAI",
    # Core CS & Testing
    "data structures": "Data Structures",
    "dsa": "Data Structures",
    "algorithms": "Algorithms",
    "system design": "System Design",
    "pytest": "Pytest",
    "jest": "Jest",
    "cypress": "Cypress",
    "jwt": "OAuth 2.0 / JWT",
    "oauth": "OAuth 2.0 / JWT",
}

# Outdated / Legacy technologies
OUTDATED_TECHNOLOGIES: Set[str] = {
    "jquery",
    "flash",
    "actionscript",
    "silverlight",
    "visual basic",
    "vb6",
    "vb.net",
    "svn",
    "subversion",
    "cvs",
    "angularjs",
    "angular 1",
    "coffeescript",
    "coldfusion",
    "cobol",
    "fortran",
    "pascal",
    "frontpage",
    "dreamweaver",
}

# Core skill designations (high foundational engineering importance)
CORE_SKILLS_LIST: Set[str] = {
    "Python", "Java", "C++", "C#", "Go", "JavaScript", "TypeScript",
    "React", "Node.js", "FastAPI", "Spring Boot", "Django",
    "PostgreSQL", "MongoDB", "MySQL", "SQL",
    "Data Structures", "Algorithms", "System Design",
    "Machine Learning", "Deep Learning",
}

# Standard complementary pairing expectations: Key Skill -> Recommended Market Skills
SKILL_MARKET_ECOSYSTEM: Dict[str, Dict[str, List[str]]] = {
    "React": {
        "expected": ["TypeScript", "Tailwind CSS", "Redux", "Jest"],
        "related": ["Next.js", "Vue.js", "GraphQL"],
    },
    "Python": {
        "expected": ["FastAPI", "SQL", "Git", "Docker", "Pytest"],
        "related": ["Django", "Pandas", "Machine Learning"],
    },
    "Java": {
        "expected": ["Spring Boot", "SQL", "REST APIs", "Git", "Docker"],
        "related": ["Microservices", "Kubernetes", "Kafka"],
    },
    "Node.js": {
        "expected": ["TypeScript", "Express.js", "MongoDB", "REST APIs", "Jest"],
        "related": ["Next.js", "Redis", "Docker"],
    },
    "FastAPI": {
        "expected": ["Python", "PostgreSQL", "Docker", "Pytest"],
        "related": ["Redis", "Celery", "REST APIs"],
    },
    "Machine Learning": {
        "expected": ["Python", "NumPy", "Pandas", "Scikit-learn", "SQL"],
        "related": ["Deep Learning", "PyTorch", "NLP", "LLM / GenAI"],
    },
    "Cloud & DevOps": {
        "expected": ["Docker", "Linux", "Git", "CI/CD", "AWS"],
        "related": ["Kubernetes", "Terraform"],
    },
}

# Proctored assessment eligible catalog
ASSESSMENT_AVAILABLE_SKILLS: Set[str] = {
    "React", "TypeScript", "JavaScript", "Python", "FastAPI", "Node.js",
    "Django", "Java", "Spring Boot", "C++", "C#", "Go", "MongoDB",
    "PostgreSQL", "MySQL", "SQL", "Redis", "Docker", "Kubernetes", "AWS",
    "Git", "Machine Learning", "Data Structures", "Algorithms", "Pytest",
    "REST APIs", "System Design",
}


def normalize_skill(raw_name: str, surrounding_context: str = "") -> str:
    """
    Normalize raw skill string to canonical standard name while maintaining strict isolation.
    - ReactJS -> React
    - JS -> JavaScript
    - K8s -> Kubernetes
    - Postgres -> PostgreSQL
    - Mongo -> MongoDB
    - Py -> Python (only when context supports it: e.g. 'Py scripts', 'Py developer', NOT 'PyTorch')
    - Java is NEVER mapped to JavaScript; C is NEVER mapped to C++.
    """
    cleaned = (raw_name or "").strip()
    if not cleaned:
        return ""

    lower = cleaned.lower()

    # Context-sensitive check for abbreviation 'Py'
    if lower == "py":
        ctx_lower = surrounding_context.lower()
        if any(term in ctx_lower for term in ("python", "script", "django", "fastapi", "flask", "backend", "pandas")):
            return "Python"
        return "Py"

    # Context-sensitive check for abbreviation 'ML'
    if lower == "ml":
        return "Machine Learning"

    # Direct canonical lookup
    if lower in CANONICAL_SYNONYMS:
        return CANONICAL_SYNONYMS[lower]

    # Specific strict regex boundaries
    if re.fullmatch(r"react(\.js|js)?", lower):
        return "React"
    if re.fullmatch(r"(vanilla\s*)?js", lower) or lower == "javascript":
        return "JavaScript"
    if re.fullmatch(r"k8s", lower):
        return "Kubernetes"
    if re.fullmatch(r"postgres(ql)?", lower):
        return "PostgreSQL"
    if re.fullmatch(r"mongo(db)?", lower):
        return "MongoDB"
    if re.fullmatch(r"docker(file| compose)?", lower):
        return "Docker"

    # Clean capitalizations of unknown skills
    return cleaned.title() if len(cleaned) <= 30 else cleaned


# Alias for cross-module compatibility
normalize_skill_name = normalize_skill


def classify_semantic_skills(
    detected_skills: List[str],
    raw_text: str = "",
) -> SemanticSkillClassification:
    """
    Analyze extracted canonical skills and return a structured semantic ontology:
    - Core skills
    - Supporting skills
    - Missing skills (industry expectations for candidate's cluster)
    - Related skills (logical expansion opportunities)
    - Outdated skills (legacy technologies found in text)
    - Skills requiring assessment (detected skills ready for 5Q / 10Q tests)
    """
    normalized_skills: List[str] = []
    seen = set()
    for s in detected_skills:
        norm = normalize_skill(s, raw_text)
        if norm and norm.lower() not in seen:
            seen.add(norm.lower())
            normalized_skills.append(norm)

    norm_set = set(normalized_skills)

    # 1. Core vs Supporting
    core: List[str] = []
    supporting: List[str] = []

    for s in normalized_skills:
        if s in CORE_SKILLS_LIST:
            core.append(s)
        else:
            supporting.append(s)

    # 2. Missing & Related skills calculation
    missing_set: Set[str] = set()
    related_set: Set[str] = set()

    for s in normalized_skills:
        if s in SKILL_MARKET_ECOSYSTEM:
            eco = SKILL_MARKET_ECOSYSTEM[s]
            for exp in eco.get("expected", []):
                if exp not in norm_set:
                    missing_set.add(exp)
            for rel in eco.get("related", []):
                if rel not in norm_set:
                    related_set.add(rel)

    # Always ensure baseline engineering foundational expectations
    engineering_foundations = ["Git", "Data Structures", "Algorithms", "SQL"]
    for foundation in engineering_foundations:
        if foundation not in norm_set:
            missing_set.add(foundation)

    # Filter out skills already present in detected
    missing_list = [m for m in sorted(missing_set) if m not in norm_set][:6]
    related_list = [r for r in sorted(related_set) if r not in norm_set and r not in missing_set][:6]

    # 3. Outdated skills search in raw text
    outdated: List[str] = []
    text_lower = raw_text.lower()
    for legacy in OUTDATED_TECHNOLOGIES:
        if re.search(rf"\b{re.escape(legacy)}\b", text_lower):
            outdated.append(legacy.title())

    # 4. Skills requiring assessment
    to_assess: List[str] = [
        s for s in normalized_skills if s in ASSESSMENT_AVAILABLE_SKILLS
    ]

    return SemanticSkillClassification(
        core_skills=core,
        supporting_skills=supporting,
        missing_skills=missing_list,
        related_skills=related_list,
        outdated_skills=sorted(set(outdated)),
        skills_requiring_assessment=to_assess,
    )
