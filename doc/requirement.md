- I have some requirement update on checkbox-relation-engine-design.
    - The checkbox relation engine is actually a part of a bigger module named rule-set
    - The rule sets are item divided by Resource Type and Resource Name. The module is for CRUD rule set.
    - For this instance I focus on the create rule set page. 
    - The rule set page will have 2 dropdown for Resource Type & Resource Name, with each combination will give us a unique page to create a rule set.
    - The common structure of an rule set will be an ACTION table with 2 column for name & ACTION checkboxes & another FIELD table that have 3 column name and VIEW & EDIT checkboxes. Some combination will have statues, which is some kind of label list, when user select a label the ACTION & FIELD table content (the checkboxes) will be different.
    
    - With that said the content of the table will be defined by the BE through an api that take resource type & resource name with these information. 
        - Config, an object contain 2 array named action, view, edit (for those table) contain these item with these structure:
            - The ID of the data that BE return will in form like this RESOURCE_NAME/STATUS/TYPE/PATH (ex: AI_FEATURE/IN_PROGRESS/VIEW/properties.name)
            - checked (is this checked by default)
            - disabled (is this disabled by defualt) 

        - The relation (as defined in the docs)
    - Update requirement for the relation: 
        - Define a common name for every ACTION, VIEW_FIELD and EDIT_FIELD, since there maybe some relation that can toggle every checkboxes in those category, defining will take a lot of times
        - Define some way, syntax to make a rule apply for every STATUS (so what I mean is to define 2 common relation for AI_FEATURE/IN_PROGRESS/VIEW/ABC and AI_FEATURE/IN_REVIEW/VIEW/ABC we can do AI_FEATURE/*/VIEW/ABC), the same with every other RESOURCE_NAME, TYPE, PATH
        - Some behavior is business logic (never gonna change) like the when check EDIT, VIEW will auto check and when uncheck VIEW, EDIT will auto uncheck (of course the PATH must be the same), and I would like to some how generate these relation in FE to save resource on network and reduce the manual definitaion. What do you think about this, be honest.








