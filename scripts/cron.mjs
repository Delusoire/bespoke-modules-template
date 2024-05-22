import path from "node:path"
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

if (commits.length) {
   const allAddedFiles = await fetchAddedFiles( { owner, repo, commit: commits.at( -1 ) } );

   const metadata = await readJSON( "./module/metadata.json" )
   const classmapPathRe = /^(?<version>\d+\.\d+\.\d+)\/classmap-(?<timestamp>\d{13})\.json$/

   for ( const file of allAddedFiles ) {
      const match = file.filename.match(classmapPathRe)
      if ( !match ) {
         continue
      }

      const { version, timestamp } = match.groups

      const classmap = await fetch( file.raw_url ).then( res => res.json() )

      const fingerprint = `sp-${version}-cm-${timestamp}`
      const outDir = path.join("module", "dist", fingerprint)

      const transpiler = new Transpiler(classmap)
      const builder = new Builder(transpiler, { metadata, outDir, copyUnknown: true })

      await builder.build("module")
   }
}
