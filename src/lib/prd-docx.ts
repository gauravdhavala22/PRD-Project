import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
} from "docx";


export type PrdContent = {
  executive_summary: string;
  problem_statement: string;
  business_goals: string[];
  functional_requirements: string[];
  risks: string[];
  assumptions: string[];
  open_questions: string[];
};

function textParagraph(text: string) {
  return new Paragraph({
    children: [new TextRun(text)],
    spacing: { after: 120 },
  });
}

function heading2(label: string) {
  return new Paragraph({
    text: label,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
  });
}

export async function downloadPrdAsDocx(title: string, content: PrdContent) {
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 36, bold: true, font: "Arial", color: "1F2937" },
          paragraph: { spacing: { before: 400, after: 240 }, outlineLevel: 0 },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { size: 26, bold: true, font: "Arial", color: "374151" },
          paragraph: { spacing: { before: 280, after: 120 }, outlineLevel: 1 },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
            },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({ text: title, bold: true, size: 20, color: "6B7280" }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun("Page "),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "Product Requirements Document",
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
            run: { italics: true, color: "6B7280" },
          }),

          heading2("Executive Summary"),
          textParagraph(content.executive_summary || "No executive summary provided."),

          heading2("Problem Statement"),
          textParagraph(content.problem_statement || "No problem statement provided."),

          heading2("Business Goals"),
          ...(content.business_goals.length
            ? content.business_goals.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No business goals listed.")]),

          heading2("Functional Requirements"),
          ...(content.functional_requirements.length
            ? content.functional_requirements.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No functional requirements listed.")]),

          heading2("User Stories"),
          ...(content.user_stories.length
            ? content.user_stories.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No user stories listed.")]),

          heading2("Acceptance Criteria"),
          ...(content.acceptance_criteria.length
            ? content.acceptance_criteria.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No acceptance criteria listed.")]),

          heading2("Risks"),
          ...(content.risks.length
            ? content.risks.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No risks listed.")]),

          heading2("Assumptions"),
          ...(content.assumptions.length
            ? content.assumptions.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No assumptions listed.")]),

          heading2("Open Questions"),
          ...(content.open_questions.length
            ? content.open_questions.map((item) => textParagraph(`• ${item}`))
            : [textParagraph("No open questions listed.")]),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_")}.docx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
