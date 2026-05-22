import React from "react";

const technicalSkills = [
  "Python",
  "JavaScript",
  "React.js",
  "Gen-AI",
  "n8n Automations",
  "HTML5",
  "CSS3",
  "SQL",
  "MySQL"
];

const strengths = [
  "Problem solving",
  "Frontend development",
  "Fast learner",
  "Team collaboration",
  "Creative thinking"
];

const projects = [
  {
    title: "AI Research & Knowledge Hub for Enterprises",
    stack: "Gen-AI, RAG, n8n Automations, LLM Workflows",
    summary:
      "Built an enterprise knowledge hub that ingests wikis, documents, and PDFs; applies RAG for precise retrieval; rephrases responses through LLMs for clarity; routes unresolved queries to relevant teams using agents; and provides text-to-audio summaries to improve productivity and onboarding speed."
  },
  {
    title: "Splitter Web App",
    stack: "HTML, CSS, JavaScript",
    summary:
      "Developed a responsive utility application with interactive UI behavior and clean component structure."
  },
  {
    title: "Mathsss Web App",
    stack: "HTML, CSS, JavaScript",
    summary:
      "Built a math-focused web application with user-friendly navigation and smooth, responsive interactions."
  },
  {
    title: "Logical Web App",
    stack: "HTML, CSS, JavaScript",
    summary:
      "Designed and implemented a logic-based web platform with engaging interface patterns and dynamic frontend behavior."
  },
  {
    title: "ByteBrewCafe Website",
    stack: "HTML, CSS, JavaScript",
    summary:
      "Created a modern cafe-themed website featuring responsive layouts, visual consistency, and accessible structure."
  },
  {
    title: "ChemLearn Platform",
    stack: "HTML, CSS, JavaScript",
    summary:
      "Developed an educational web platform focused on interactive learning workflows and mobile-first responsiveness."
  }
];

export default function ResumeWebsiteComplete() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10">
      <article className="mx-auto w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="bg-slate-900 px-8 py-10 text-white">
          <h1 className="text-4xl font-bold tracking-tight">Bussa Thrishank</h1>
          <p className="mt-2 text-slate-300">
            B.Tech CSE (Generative AI) Student | Frontend Developer
          </p>

          <div className="mt-5 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
            <p>Phone: +91 79899 71353</p>
            <p>Email: bussathrishank595@gmail.com</p>
            <p>
              LinkedIn:{" "}
              <a
                href="https://www.linkedin.com/in/thrishank-bussa-868a03370"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-400 underline-offset-4 hover:text-white"
              >
                linkedin.com/in/thrishank-bussa-868a03370
              </a>
            </p>
            <p>
              Portfolio:{" "}
              <a
                href="https://portsa.niat.tech/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-slate-400 underline-offset-4 hover:text-white"
              >
                portsa.niat.tech
              </a>
            </p>
          </div>
        </header>

        <section className="grid gap-8 p-8 md:grid-cols-3">
          <aside className="space-y-8 md:col-span-1">
            <section>
              <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
                Education
              </h2>
              <div className="mt-3 space-y-1 text-sm text-slate-700">
                <h3 className="text-base font-semibold text-slate-900">
                  Aurora Deemed University
                </h3>
                <p>B.Tech in CSE (Generative AI)</p>
                <p>Academic Score: 90%+</p>
              </div>
            </section>

            <section>
              <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
                Technical Skills
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {technicalSkills.map((skill) => (
                  <li
                    key={skill}
                    className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700"
                  >
                    {skill}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="border-b border-slate-200 pb-2 text-xl font-semibold text-slate-900">
                Core Strengths
              </h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {strengths.map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </section>
          </aside>

          <div className="space-y-8 md:col-span-2">
            <section>
              <h2 className="border-b border-slate-200 pb-2 text-2xl font-semibold text-slate-900">
                Professional Summary
              </h2>
              <p className="mt-3 leading-7 text-slate-700">
                Motivated Computer Science student specializing in Generative AI with
                strong frontend development capabilities. Experienced in building
                responsive and interactive web applications using React.js, JavaScript,
                Python, and SQL. Passionate about creating high-quality digital
                experiences and continuously improving through practical projects.
              </p>
            </section>

            <section>
              <h2 className="border-b border-slate-200 pb-2 text-2xl font-semibold text-slate-900">
                Selected Projects
              </h2>
              <div className="mt-4 space-y-5">
                {projects.map((project) => (
                  <article key={project.title}>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {project.title}
                    </h3>
                    <p className="text-sm font-medium text-slate-500">
                      {project.stack}
                    </p>
                    <p className="mt-1 text-slate-700">{project.summary}</p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      </article>
    </main>
  );
}
