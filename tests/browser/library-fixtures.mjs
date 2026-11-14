// Mutations correspond to the lesson's editable scenario and optional hints.
export function libraryCases(example) {
  const variant = (file, before, after) => {
    if (!example.files[file].includes(before))
      throw new Error(`Missing library fixture marker: ${before}`);
    return {
      ...example,
      files: {
        ...example.files,
        [file]: example.files[file].replace(before, after),
      },
    };
  };
  const afterAda = "         library.borrow(intro, ada)";
  const afterGrace = "         library.borrow(intro, grace)";
  const invariant = variant(
    "library.e",
    "within_loan_limit: loans_of(a_borrower) < a_borrower.loan_limit",
    "within_loan_limit: True",
  );
  invariant.files["main.e"] = invariant.files["main.e"].replace(
    afterGrace,
    afterGrace + "\n         library.borrow(reusable, grace)",
  );
  const unregistered = variant(
    "main.e",
    "intro, contracts, reusable: BOOK",
    "intro, contracts, reusable, other: BOOK",
  );
  unregistered.files["main.e"] = unregistered.files["main.e"].replace(
    afterAda,
    afterAda +
      '\n         create other.make("Eiffel basics")\n         library.borrow(other, grace)',
  );
  return [
    {
      name: "library_loan_limit",
      input: variant(
        "main.e",
        afterAda,
        afterAda + "\n         library.borrow(reusable, ada)",
      ),
      status: "program_error",
      tag: "within_loan_limit",
      kind: "Require Assertion Violated",
    },
    {
      name: "library_wrong_return",
      input: variant(
        "main.e",
        "library.give_back(intro, ada)",
        "library.give_back(intro, grace)",
      ),
      status: "program_error",
      tag: "borrowed_by_you",
      kind: "Require Assertion Violated",
    },
    {
      name: "library_unregistered_book",
      input: unregistered,
      status: "program_error",
      tag: "book_registered",
      kind: "Require Assertion Violated",
    },
    {
      name: "library_old_count",
      input: variant(
        "library.e",
        "one_more_loan: loans_of(a_borrower) = old loans_of(a_borrower) + 1",
        "one_more_loan: loans_of(a_borrower) = old loans_of(a_borrower) + 2",
      ),
      status: "program_error",
      tag: "one_more_loan",
      kind: "Ensure Assertion Violated",
    },
    {
      name: "library_bypassed_limit",
      input: invariant,
      status: "program_error",
      tag: "loan_limits_respected",
      kind: "Class Invariant Violation",
    },
  ];
}
