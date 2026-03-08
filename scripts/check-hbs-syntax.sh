#!/usr/bin/env bash

# Find all .hbs files in the public/templates directory
hbs_files=$(find public/templates -name "*.hbs")

# Search for any occurrences of ../ in those files
# The regex looks for ../ specifically within Handlebars tags if we want to be precise, 
# but generally ../ should not be used in these templates at all for context shifting.
found_illegal_syntax=$(grep -r "\.\./" public/templates/)

if [ -n "$found_illegal_syntax" ]; then
  echo "Error: Detected incompatible Handlebars syntax '../' for Glimmer (Foundry VTT)."
  echo "Please use '@root.' or other context-safe alternatives instead."
  echo "Offending lines:"
  echo "$found_illegal_syntax"
  exit 1
else
  echo "No incompatible Handlebars syntax '../' found."
  exit 0
fi
