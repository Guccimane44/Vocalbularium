# increment plan for v0.17.0 (deferred)

This plan will be executed using poteto-mode, so it needs to be tailored for it.

## The generation effort
### add a button for deck setting in the deck configuration page.
currently it can only contain the generation efforts and reflection on/off(defined below). this two options will apply to all the
module in the deck.

### adding generation effort setting and reflection on/off
Add two new options in the settings submenu:
1. generation efforts
2. reflection on/off: model will reflect on the result and try to improve it. So adding an extra round of request.
the module generation will by default, inherit from the deck setting. The module level setting can override the deck level setting.

## The expansion pilot in language module family
The facets in every language module need to be tailored to the language itself. we firstly do a small expansion for three other languages:
spanish, japanese, urdu. however im not an expert on those languages. so we need to iterate on the facet choices (picking the existing/tailoring the existing facets/creating new facets). One ceavat: dont threat the existing facets as the definitive template. every module is a growing process.

### the suggesting expansion workflow
i studied german before. for instance, the declension and conjugation facets are something that i considered as important for a german learner. And im pretty sure there are many those aspects that special to every langugaes.

for every new language module expansion
1. do reasearch on internet: what facets would be helpful for this language module. our main target audiance is either the language learner or
the people who already understand the language but use it for own purposes. for example people might want to know the etymology, might want to know a fun fact etc.
2. draft the facet lists
3. tailor the prompt and constraints
4. external audit on the generation result using opus 5.5 medium
5. reflect on the audit and repeat 3.



since we are introducing different reasoning levels

## Notes on future minor increments
in the upcoming iterations in v.0.17.x, we will work on UI and frontend.

