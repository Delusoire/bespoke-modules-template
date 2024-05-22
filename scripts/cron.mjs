import path from "node:path"
import fs from "node:fs/promises"
import { Octokit } from "octokit";
import {build, Builder, readJSON, Transpiler} from "@delu/tailor"

const octokit = new Octokit();

async function fetchCommitsSince(opts) {
   const query = `
   {
      repository(owner: "${opts.owner}", name: "${opts.repo}") {
         defaultBranchRef {
            target {
               ... on Commit {
                  history(first: 100, since: "${opts.sinceDate.toISOString()}") {
                     nodes {
                        oid
                     }
                  }
               }
            }
         }
      }
   }`;

   const result = await octokit.graphql(query);

   return result.repository.defaultBranchRef.target.history.nodes.map(node => node.oid);
}

async function fetchAddedFiles(opts) {
   const c = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: opts.owner,
      repo: opts.repo,
      basehead: opts.commit + "^...HEAD",
   } );
   const addedFiles = c.data.files.filter(file => file.status === "added")
   return addedFiles;
}

const owner = "spicetify";
const repo = "classmap";
const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

const commits = await fetchCommitsSince({ owner, repo, sinceDate });

if ( commits.length ) {
   const earlistCommit = commits.at( -1 )
   const allAddedFiles = await fetchAddedFiles( { owner, repo, commit: earlistCommit } );

   const modulePath = "module"
   const metadata = await readJSON( path.join(modulePath, "metadata.json" ))
   const classmapPathRe = /^(?<version>\d+\.\d+\.\d+)\/classmap-(?<timestamp>\d{13})\.json$/

   for ( const file of allAddedFiles ) {
      const match = file.filename.match(classmapPathRe)
      if ( !match ) {
         continue
      }

      const { version, timestamp } = match.groups

      const classmap = await fetch( file.raw_url ).then( res => res.json() )

      const fingerprint = `sp-${version}-cm-${timestamp}`
      const outDir = path.join(modulePath, "dist", fingerprint)

      const transpiler = new Transpiler(classmap)
      const builder = new Builder(transpiler, { metadata, outDir, copyUnknown: true })

      try {
         await builder.build( modulePath );
      } catch ( err ) {
         await fs.rm(outDir, { recursive: true, force: true })
         console.warn(`Build for ${outDir} failed with error: ${err}`)
      }
   }
}
