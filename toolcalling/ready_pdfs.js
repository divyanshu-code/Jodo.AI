import { fileload } from "./ingestion_step.js";

const files = [                                                                                            // array for handling the mulitples files and namespaces 
    { path: './public/ESSentr_Company_Policy_Document.pdf', namespace: 'essentr-policy' },
    // { path: './leave-policy.pdf',   namespace: 'leave-policy' },
    // { path: './salary-guide.pdf',   namespace: 'salary-guide' },
    // { path: './code-of-conduct.pdf',namespace: 'code-of-conduct' },
]

for (const file of files) {
    console.log(`Indexing ${file.path}...`)
    await fileload(file.path, file.namespace)
}