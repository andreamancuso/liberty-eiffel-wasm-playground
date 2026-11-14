class CONTRACT_FAILURE

create {}
   make

feature {}
   make
      do
         check
            expected_failure: False
         end
         io.put_string("ERROR: assertion was skipped%N")
      end

end
