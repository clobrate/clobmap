# Release 2.1 ideas 
1. Change default mind map to daily chores tracking one. 
2. change for desktop app, default way to store notes is under notelets folder as individual mark down files irrespective of note size, not yaml inline, this means when a yaml is opened in desktop and setting is notes in notelets folder (or inline notes is OFF) automatic migration happens to individual mark down files under notelets folder. user can choose a different sub folder, but the folder should be sub folder to where yaml file is present, we don't allow reading mark down files outside the yaml folder. This ensures we can commit git, maintain relative paths and folders can be moved without impacting our paths saved. 
3. on desktop app, default setting should be lean-yaml; that means positions will be in different yaml. 
4. 37 Dependabot vulnerabilities (7 high) on the default branch — good to triage before this version is the one users are on.
5. when we go back from notelets view to mindmap the previous zoom is not remembered. 
